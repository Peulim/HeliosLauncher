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
        assert.equal(fs.readFileSync(path.join(instanceDir, relativePath), 'utf8'), contents)
    }
    assert.equal(fs.readFileSync(path.join(instanceDir, 'config/server-rules.toml'), 'utf8'), 'server-updated rules')
})

test('leaves new player preference defaults in place when no prior file exists', t => {
    const instanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobbleverse-instance-'))
    t.after(() => fs.rmSync(instanceDir, { recursive: true, force: true }))

    const savedPreferences = capture(instanceDir)
    fs.writeFileSync(path.join(instanceDir, 'options.txt'), 'new player defaults')
    restore(instanceDir, savedPreferences)

    assert.equal(fs.readFileSync(path.join(instanceDir, 'options.txt'), 'utf8'), 'new player defaults')
})
