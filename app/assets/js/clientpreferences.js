const fs = require('fs-extra')
const path = require('path')

// These files contain player choices and keybinds rather than server rules.
const PLAYER_PREFERENCE_PATHS = [
    'options.txt',
    'optionsshaders.txt',
    'optionsof.txt',
    'defaultoptions.journal.json',
    'config/iris.properties',
    'config/oculus.properties',
    'config/sodium-options.json',
    'config/reeses_sodium_options.json',
    'config/fzzy_config/keybinds.toml',
    'config/xaerohud.txt',
    'config/respackopts/_respackopts.conf'
]

const LEGACY_GRASS_PACK = 'Cobblemon Classic Grass Pack v1.0 MC1.21.1.zip'
const STAY_TRUE_PACK = 'Stay_True_1.21.zip'
const PUNCHY_PACK = '[Chilli´s] punchy! cobblemon.zip'
const XAERO_PREVIOUS_SERVER_HOST = 'enx-cirion-128.enx.host'
const XAERO_CURRENT_SERVER_HOST = 'enx-soc-12.enx.host'

exports.protectDistributionPreferences = function(distribution, instancesDirectory) {
    for (const server of distribution.servers) {
        const filterModules = modules => modules.filter(module => {
            const relativePath = module.artifact?.path?.replace(/\\/g, '/')
            const isPreference = PLAYER_PREFERENCE_PATHS.includes(relativePath)
                || /^shaderpacks\/[^/]+\.txt$/.test(relativePath || '')
            if (module.type === 'File' && isPreference) {
                const absolutePath = path.join(instancesDirectory, server.id, relativePath)
                if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
                    return false
                }
            }
            if (module.subModules) {
                module.subModules = filterModules(module.subModules)
            }
            return true
        })
        // Existing player preferences are not pack artifacts. Missing files still
        // download normally so first-time players receive the packaged defaults.
        server.modules = filterModules(server.modules)
    }
    return distribution
}

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
            packs = packs.filter(pack => pack !== `file/${LEGACY_GRASS_PACK}` && pack !== `file/${STAY_TRUE_PACK}`)
            for (const pack of ['punchy:punchy', `file/${PUNCHY_PACK}`]) {
                if (!packs.includes(pack)) {
                    packs.push(pack)
                }
            }
            const punchyIndex = packs.findIndex(pack => pack === 'punchy:punchy' || pack === `file/${PUNCHY_PACK}`)
            packs.splice(punchyIndex, 0, `file/${STAY_TRUE_PACK}`)
            return prefix + JSON.stringify(packs)
        })
        if (!foundResourcePacks) {
            migrated += `${migrated.length > 0 && !migrated.endsWith('\n') ? '\n' : ''}resourcePacks:["file/${STAY_TRUE_PACK}","punchy:punchy","file/${PUNCHY_PACK}"]\n`
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

function copyMissingXaeroFiles(sourceDirectory, targetDirectory) {
    if (!fs.existsSync(sourceDirectory)) {
        return
    }
    fs.ensureDirSync(targetDirectory)
    for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
        if (entry.name === 'cache' || entry.name === '.lock' || entry.name.endsWith('.temp')) {
            continue
        }
        const sourcePath = path.join(sourceDirectory, entry.name)
        const targetPath = path.join(targetDirectory, entry.name)
        if (entry.isDirectory()) {
            copyMissingXaeroFiles(sourcePath, targetPath)
        } else if (entry.isFile() && !fs.existsSync(targetPath)) {
            fs.copyFileSync(sourcePath, targetPath)
        }
    }
}

function hasXaeroLock(directory) {
    if (!fs.existsSync(directory)) {
        return false
    }
    return fs.readdirSync(directory, { withFileTypes: true }).some(entry => {
        if (entry.name === '.lock') {
            return true
        }
        return entry.isDirectory() && hasXaeroLock(path.join(directory, entry.name))
    })
}

exports.migrateXaeroMaps = function(instanceDirectory, serverAddress) {
    let currentHost
    try {
        currentHost = new URL(`tcp://${serverAddress}`).hostname.toLowerCase()
    } catch (_) {
        return
    }
    if (currentHost !== XAERO_CURRENT_SERVER_HOST) {
        return
    }

    const xaeroDirectory = path.join(instanceDirectory, 'xaero')
    const migrationMarker = path.join(xaeroDirectory, '.launcher-map-migration-v1')
    if (fs.existsSync(migrationMarker)) {
        return
    }

    const mapDirectories = []
    for (const mapType of ['world-map', 'minimap']) {
        const mapDirectory = path.join(xaeroDirectory, mapType)
        const sourceDirectory = path.join(mapDirectory, `Multiplayer_${XAERO_PREVIOUS_SERVER_HOST}`)
        const targetDirectory = path.join(mapDirectory, `Multiplayer_${XAERO_CURRENT_SERVER_HOST}`)
        if (fs.existsSync(sourceDirectory)) {
            // Do not touch map files while Xaero is writing them in the running game.
            if (hasXaeroLock(sourceDirectory) || hasXaeroLock(targetDirectory)) {
                return
            }
            mapDirectories.push({ sourceDirectory, targetDirectory })
        }
    }

    for (const { sourceDirectory, targetDirectory } of mapDirectories) {
        copyMissingXaeroFiles(sourceDirectory, targetDirectory)
    }

    if (mapDirectories.length > 0) {
        fs.ensureDirSync(xaeroDirectory)
        fs.writeFileSync(migrationMarker, `${XAERO_PREVIOUS_SERVER_HOST} -> ${XAERO_CURRENT_SERVER_HOST}\n`)
    }
}

exports.capture = function(instanceDirectory) {
    const saved = new Map()
    const preferencePaths = [...PLAYER_PREFERENCE_PATHS]
    // Iris/OptiFine store each pack's user settings beside the shader archive.
    // Preserve settings only, so shader archives still receive pack updates.
    const shaderDirectory = path.join(instanceDirectory, 'shaderpacks')
    if (fs.existsSync(shaderDirectory) && fs.statSync(shaderDirectory).isDirectory()) {
        for (const entry of fs.readdirSync(shaderDirectory, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith('.txt')) {
                preferencePaths.push(path.join('shaderpacks', entry.name))
            }
        }
    }
    for (const relativePath of preferencePaths) {
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
