const fs = require('fs-extra')
const path = require('path')

// These files contain player choices and keybinds rather than server rules.
const PLAYER_PREFERENCE_PATHS = [
    'options.txt',
    'optionsshaders.txt',
    'optionsof.txt',
    'config/sodium-options.json',
    'config/reeses_sodium_options.json',
    'config/fzzy_config/keybinds.toml',
    'config/xaerohud.txt',
    'config/respackopts/_respackopts.conf'
]

exports.capture = function(instanceDirectory) {
    const saved = new Map()
    for (const relativePath of PLAYER_PREFERENCE_PATHS) {
        const absolutePath = path.join(instanceDirectory, relativePath)
        if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
            saved.set(relativePath, fs.readFileSync(absolutePath))
        }
    }
    return saved
}

exports.restore = function(instanceDirectory, savedPreferences) {
    for (const [relativePath, contents] of savedPreferences) {
        const absolutePath = path.join(instanceDirectory, relativePath)
        fs.ensureDirSync(path.dirname(absolutePath))
        fs.writeFileSync(absolutePath, contents)
    }
}
