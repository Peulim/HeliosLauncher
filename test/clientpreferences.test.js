const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { capture, restore } = require('../app/assets/js/clientpreferences')

test('preserves existing player controls and visual preferences through a pack update', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))

    const preferences = {
        'options.txt': 'key_key.forward:key.keyboard.i\nresourcePacks:["vanilla"]\n',
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
    assert.match(restoredOptions, /^resourcePacks:\["vanilla","punchy:punchy","file\/\[Chilli´s\] punchy! cobblemon\.zip"\]$/m)
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
    assert.match(migrated, /^resourcePacks:\["vanilla","punchy:punchy","file\/\[Chilli´s\] punchy! cobblemon\.zip"\]$/m)
    assert.equal(fs.existsSync(path.join(resourcePacksDir, 'Cobblemon Classic Grass Pack v1.0 MC1.21.1.zip')), false)
})

test('leaves new player preference defaults in place when no prior file exists', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))

    const savedPreferences = capture(instanceDir)
    fs.writeFileSync(path.join(instanceDir, 'options.txt'), 'new player defaults')
    restore(instanceDir, savedPreferences)

    assert.equal(fs.readFileSync(path.join(instanceDir, 'options.txt'), 'utf8'), 'new player defaults')
})

test('migrates existing resource pack selections even when no download repair is needed', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))
    fs.writeFileSync(path.join(instanceDir, 'options.txt'), 'key_key.jump:key.keyboard.space\n')

    require('../app/assets/js/clientpreferences').migrateResourcePacks(instanceDir)

    const options = fs.readFileSync(path.join(instanceDir, 'options.txt'), 'utf8')
    assert.match(options, /^key_key\.jump:key\.keyboard\.space$/m)
    assert.match(options, /^resourcePacks:\["punchy:punchy","file\/\[Chilli´s\] punchy! cobblemon\.zip"\]$/m)
})
