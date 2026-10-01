const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { capture, migrateXaeroMaps, restore, protectDistributionPreferences } = require('../app/assets/js/clientpreferences')

test('updates install missing defaults but do not queue existing music and shader preferences for replacement', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-update-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const instance = path.join(root, 'pack')
    const files = {
        'options.txt': 'soundCategory_music:0.0\n',
        'config/iris.properties': 'shaderPack=Custom.zip\n',
        'shaderpacks/Custom.zip.txt': 'BLOOM=false\n',
        'defaultoptions.journal.json': '{"options":true}\n'
    }
    for (const [file, contents] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(instance, file)), { recursive: true })
        fs.writeFileSync(path.join(instance, file), contents)
    }
    const paths = [...Object.keys(files), 'config/oculus.properties', 'shaderpacks/New.zip.txt', 'shaderpacks/Custom.zip', 'shaderpacks/Custom/shaders/lang/en_us.lang', 'config/cobblemon/main.json']
    const moduleFor = file => ({ type: 'File', artifact: { path: file } })
    const distribution = { servers: [{ id: 'pack', modules: paths.map(moduleFor) }, { id: 'new-pack', modules: paths.map(moduleFor) }] }
    protectDistributionPreferences(distribution, root)
    assert.deepEqual(distribution.servers[0].modules.map(m => m.artifact.path), paths.slice(Object.keys(files).length))
    assert.deepEqual(distribution.servers[1].modules.map(m => m.artifact.path), paths)
    for (const [file, contents] of Object.entries(files)) {
        assert.equal(fs.readFileSync(path.join(instance, file), 'utf8'), contents)
    }
})

test('preserves shader selection and per-pack settings when an update replaces or deletes them', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))
    const preferences = {
        'config/iris.properties': 'enableShaders=true\nshaderPack=Complementary.zip\n',
        'config/oculus.properties': 'enableShaders=false\n',
        'optionsshaders.txt': 'shaderPack=Custom.zip\n',
        'shaderpacks/Complementary.zip.txt': 'SHADOW_DISTANCE=64\nBLOOM=false\n',
        'shaderpacks/My custom shader.txt': 'QUALITY=LOW\n'
    }
    for (const [relativePath, contents] of Object.entries(preferences)) {
        const target = path.join(instanceDir, relativePath)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, contents)
    }
    fs.writeFileSync(path.join(instanceDir, 'shaderpacks/Complementary.zip'), 'old shader archive')
    fs.mkdirSync(path.join(instanceDir, 'shaderpacks/directory.txt'))

    const saved = capture(instanceDir)
    for (const relativePath of Object.keys(preferences)) {
        fs.unlinkSync(path.join(instanceDir, relativePath))
    }
    fs.writeFileSync(path.join(instanceDir, 'config/iris.properties'), 'pack defaults')
    fs.writeFileSync(path.join(instanceDir, 'shaderpacks/Complementary.zip.txt'), 'SHADOW_DISTANCE=256\n')
    fs.writeFileSync(path.join(instanceDir, 'shaderpacks/Complementary.zip'), 'updated shader archive')
    fs.writeFileSync(path.join(instanceDir, 'shaderpacks/New.zip.txt'), 'new pack defaults')

    restore(instanceDir, saved)

    for (const [relativePath, contents] of Object.entries(preferences)) {
        assert.equal(fs.readFileSync(path.join(instanceDir, relativePath), 'utf8'), contents)
    }
    assert.equal(fs.readFileSync(path.join(instanceDir, 'shaderpacks/Complementary.zip'), 'utf8'), 'updated shader archive')
    assert.equal(fs.readFileSync(path.join(instanceDir, 'shaderpacks/New.zip.txt'), 'utf8'), 'new pack defaults')
})

test('preserves existing player controls and visual preferences through a pack update', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))

    const preferences = {
        'options.txt': 'key_key.forward:key.keyboard.i\nsoundCategory_music:0.0\nsoundCategory_master:0.35\nresourcePacks:["vanilla"]\n',
        'config/sodium-options.json': '{"quality":{"clouds":"fast"}}\n',
        'config/fzzy_config/keybinds.toml': '[keybinds]\nexample = "key.keyboard.k"\n'
    }
    for (const [relativePath, contents] of Object.entries(preferences)) {
        const targetPath = path.join(instanceDir, relativePath)
        fs.mkdirSync(path.dirname(targetPath), { recursive: true })
        fs.writeFileSync(targetPath, contents)
    }

    const savedPreferences = capture(instanceDir)
    fs.writeFileSync(path.join(instanceDir, 'options.txt'), 'server-updated options')
    fs.writeFileSync(path.join(instanceDir, 'config/sodium-options.json'), 'server-updated sodium')
    fs.writeFileSync(path.join(instanceDir, 'config/fzzy_config/keybinds.toml'), 'server-updated keybinds')
    fs.writeFileSync(path.join(instanceDir, 'config/server-rules.toml'), 'server-updated rules')

    restore(instanceDir, savedPreferences)

    for (const [relativePath, contents] of Object.entries(preferences)) {
        if (relativePath === 'options.txt') {
            continue
        }
        assert.equal(fs.readFileSync(path.join(instanceDir, relativePath), 'utf8'), contents)
    }
    const restoredOptions = fs.readFileSync(path.join(instanceDir, 'options.txt'), 'utf8')
    assert.match(restoredOptions, /^key_key\.forward:key\.keyboard\.i$/m)
    assert.match(restoredOptions, /^soundCategory_music:0\.0$/m)
    assert.match(restoredOptions, /^soundCategory_master:0\.35$/m)
    assert.match(restoredOptions, /^resourcePacks:\["vanilla","file\/Stay_True_1\.21\.zip","punchy:punchy","file\/\[Chilli´s\] punchy! cobblemon\.zip"\]$/m)
    assert.equal(fs.readFileSync(path.join(instanceDir, 'config/server-rules.toml'), 'utf8'), 'server-updated rules')
})

test('activates Punchy packs and removes the old grass pack without resetting other options', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))

    const resourcePacksDir = path.join(instanceDir, 'resourcepacks')
    fs.mkdirSync(resourcePacksDir)
    fs.writeFileSync(path.join(resourcePacksDir, 'Cobblemon Classic Grass Pack v1.0 MC1.21.1.zip'), 'old grass')
    fs.writeFileSync(path.join(resourcePacksDir, '[Chilli´s] punchy! cobblemon.zip'), 'punchy')
    const options = [
        'key_key.forward:key.keyboard.i',
        'resourcePacks:["vanilla","file/Cobblemon Classic Grass Pack v1.0 MC1.21.1.zip"]',
        'soundCategory_music:0.5'
    ].join('\n') + '\n'
    fs.writeFileSync(path.join(instanceDir, 'options.txt'), options)

    const savedPreferences = capture(instanceDir)
    fs.writeFileSync(path.join(instanceDir, 'options.txt'), 'fresh defaults')
    restore(instanceDir, savedPreferences)

    const migrated = fs.readFileSync(path.join(instanceDir, 'options.txt'), 'utf8')
    assert.match(migrated, /^key_key\.forward:key\.keyboard\.i$/m)
    assert.match(migrated, /^soundCategory_music:0\.5$/m)
    assert.match(migrated, /^resourcePacks:\["vanilla","file\/Stay_True_1\.21\.zip","punchy:punchy","file\/\[Chilli´s\] punchy! cobblemon\.zip"\]$/m)
    assert.equal(fs.existsSync(path.join(resourcePacksDir, 'Cobblemon Classic Grass Pack v1.0 MC1.21.1.zip')), false)
})

test('leaves new player preference defaults in place when no prior file exists', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))

    const savedPreferences = capture(instanceDir)
    fs.writeFileSync(path.join(instanceDir, 'options.txt'), 'new player defaults')
    fs.mkdirSync(path.join(instanceDir, 'config'))
    fs.mkdirSync(path.join(instanceDir, 'shaderpacks'))
    fs.writeFileSync(path.join(instanceDir, 'config/iris.properties'), 'enableShaders=true\n')
    fs.writeFileSync(path.join(instanceDir, 'shaderpacks/New.zip.txt'), 'QUALITY=HIGH\n')
    restore(instanceDir, savedPreferences)

    assert.equal(fs.readFileSync(path.join(instanceDir, 'options.txt'), 'utf8'), 'new player defaults')
    assert.equal(fs.readFileSync(path.join(instanceDir, 'config/iris.properties'), 'utf8'), 'enableShaders=true\n')
    assert.equal(fs.readFileSync(path.join(instanceDir, 'shaderpacks/New.zip.txt'), 'utf8'), 'QUALITY=HIGH\n')
})

test('migrates existing resource pack selections even when no download repair is needed', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))
    fs.writeFileSync(path.join(instanceDir, 'options.txt'), 'key_key.jump:key.keyboard.space\n')

    require('../app/assets/js/clientpreferences').migrateResourcePacks(instanceDir)

    const options = fs.readFileSync(path.join(instanceDir, 'options.txt'), 'utf8')
    assert.match(options, /^key_key\.jump:key\.keyboard\.space$/m)
    assert.match(options, /^resourcePacks:\["file\/Stay_True_1\.21\.zip","punchy:punchy","file\/\[Chilli´s\] punchy! cobblemon\.zip"\]$/m)
})

test('merges Xaero maps from the previous Cobbleverse server address without overwriting newer map data', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))

    const xaeroDir = path.join(instanceDir, 'xaero')
    const previousMap = path.join(xaeroDir, 'world-map', 'Multiplayer_enx-cirion-128.enx.host', 'null')
    const currentMap = path.join(xaeroDir, 'world-map', 'Multiplayer_enx-soc-12.enx.host', 'null')
    const previousMinimap = path.join(xaeroDir, 'minimap', 'Multiplayer_enx-cirion-128.enx.host')
    const currentMinimap = path.join(xaeroDir, 'minimap', 'Multiplayer_enx-soc-12.enx.host')
    fs.mkdirSync(path.join(previousMap, 'tiles'), { recursive: true })
    fs.mkdirSync(path.join(currentMap, 'tiles'), { recursive: true })
    fs.mkdirSync(path.join(previousMap, 'cache', '1'), { recursive: true })
    fs.mkdirSync(previousMinimap, { recursive: true })
    fs.writeFileSync(path.join(previousMap, 'tiles', 'old-region.zip'), 'older explored region')
    fs.writeFileSync(path.join(previousMap, 'tiles', 'shared-region.zip'), 'old version')
    fs.writeFileSync(path.join(previousMap, 'tiles', 'unfinished.zip.temp'), 'partial')
    fs.writeFileSync(path.join(previousMap, 'cache', '1', 'cache.xwmc'), 'temporary cache')
    fs.writeFileSync(path.join(currentMap, 'tiles', 'shared-region.zip'), 'newer region')
    fs.writeFileSync(path.join(previousMinimap, 'waypoints.txt'), 'saved waypoints')

    migrateXaeroMaps(instanceDir, 'enx-soc-12.enx.host:10015')

    assert.equal(fs.readFileSync(path.join(currentMap, 'tiles', 'old-region.zip'), 'utf8'), 'older explored region')
    assert.equal(fs.readFileSync(path.join(currentMap, 'tiles', 'shared-region.zip'), 'utf8'), 'newer region')
    assert.equal(fs.existsSync(path.join(currentMap, 'tiles', 'unfinished.zip.temp')), false)
    assert.equal(fs.existsSync(path.join(currentMap, '.lock')), false)
    assert.equal(fs.existsSync(path.join(currentMap, 'cache')), false)
    assert.equal(fs.existsSync(path.join(previousMap, 'tiles', 'old-region.zip')), true)
    assert.equal(fs.readFileSync(path.join(currentMinimap, 'waypoints.txt'), 'utf8'), 'saved waypoints')
})

test('does not migrate Xaero data for an unrelated server address', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))
    const oldMap = path.join(instanceDir, 'xaero', 'world-map', 'Multiplayer_enx-cirion-128.enx.host')
    fs.mkdirSync(oldMap, { recursive: true })
    fs.writeFileSync(path.join(oldMap, 'region.zip'), 'map data')

    migrateXaeroMaps(instanceDir, 'another-server.example:25565')

    assert.equal(fs.existsSync(path.join(instanceDir, 'xaero', 'world-map', 'Multiplayer_another-server.example')), false)
    assert.equal(fs.readFileSync(path.join(oldMap, 'region.zip'), 'utf8'), 'map data')
})

test('waits to migrate Xaero maps while the running game has the map locked', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))
    const xaero = path.join(instanceDir, 'xaero')
    const oldMap = path.join(xaero, 'world-map', 'Multiplayer_enx-cirion-128.enx.host')
    const newMap = path.join(xaero, 'world-map', 'Multiplayer_enx-soc-12.enx.host', 'null')
    fs.mkdirSync(oldMap, { recursive: true })
    fs.mkdirSync(newMap, { recursive: true })
    fs.writeFileSync(path.join(oldMap, 'old-region.zip'), 'saved map')
    fs.writeFileSync(path.join(newMap, '.lock'), '')

    migrateXaeroMaps(instanceDir, 'enx-soc-12.enx.host:10015')

    assert.equal(fs.existsSync(path.join(newMap, 'old-region.zip')), false)
    assert.equal(fs.existsSync(path.join(xaero, '.launcher-map-migration-v1')), false)
})
