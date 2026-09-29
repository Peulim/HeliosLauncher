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

const LEGACY_GRASS_PACK = 'Cobblemon Classic Grass Pack v1.0 MC1.21.1.zip'
const PUNCHY_PACK = '[Chilli´s] punchy! cobblemon.zip'

exports.migrateResourcePacks = function(instanceDirectory) {
    const optionsPath = path.join(instanceDirectory, 'options.txt')
    if (fs.existsSync(optionsPath)) {
        const options = fs.readFileSync(optionsPath, 'utf8')
        let foundResourcePacks = false
        let migrated = options.replace(/^(resourcePacks:)(.*)$/m, (line, prefix, value) => {
            foundResourcePacks = true
            let packs
            try {
                packs = JSON.parse(value)
            } catch (_) {
                return line
            }
            if (!Array.isArray(packs)) {
                return line
            }
            packs = packs.filter(pack => pack !== `file/${LEGACY_GRASS_PACK}`)
            for (const pack of ['punchy:punchy', `file/${PUNCHY_PACK}`]) {
                if (!packs.includes(pack)) {
                    packs.push(pack)
                }
            }
            return prefix + JSON.stringify(packs)
        })
        if (!foundResourcePacks) {
            migrated += `${migrated.length > 0 && !migrated.endsWith('\n') ? '\n' : ''}resourcePacks:["punchy:punchy","file/${PUNCHY_PACK}"]\n`
        }
        if (migrated !== options) {
            fs.writeFileSync(optionsPath, migrated)
        }
    }

    const legacyPackPath = path.join(instanceDirectory, 'resourcepacks', LEGACY_GRASS_PACK)
    if (fs.existsSync(legacyPackPath) && fs.statSync(legacyPackPath).isFile()) {
        fs.removeSync(legacyPackPath)
    }
}

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
    if (savedPreferences.has('options.txt')) {
        exports.migrateResourcePacks(instanceDirectory)
    }
}
