const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { preserveExistingUserDataPath } = require('../app/assets/js/userdatapath')

test('keeps launcher data under its original folder after the product is renamed', t => {
    const appDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-appdata-'))
    t.after(() => fs.rmSync(appDataDirectory, { recursive: true, force: true }))

    const oldDirectory = path.join(appDataDirectory, 'Helios Launcher')
    fs.mkdirSync(oldDirectory)
    fs.writeFileSync(path.join(oldDirectory, 'config.json'), '{"savedMicrosoftAccount":true}')

    let currentUserDataPath = path.join(appDataDirectory, 'Launcher Cobbleverse')
    const electronApp = {
        getPath: name => name === 'appData' ? appDataDirectory : currentUserDataPath,
        setPath: (name, value) => {
            assert.equal(name, 'userData')
            currentUserDataPath = value
        }
    }

    preserveExistingUserDataPath(electronApp)

    assert.equal(currentUserDataPath, oldDirectory)
    assert.equal(JSON.parse(fs.readFileSync(path.join(currentUserDataPath, 'config.json'), 'utf8')).savedMicrosoftAccount, true)
})
