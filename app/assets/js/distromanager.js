const { DistributionAPI, RestResponseStatus, MavenUtil } = require('helios-core/common')
const crypto = require('crypto')
const got = require('got')

const ConfigManager = require('./configmanager')
const ClientPreferences = require('./clientpreferences')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://raw.githubusercontent.com/Peulim/CobbleverseDistribution/main/distribution.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

async function includeFabricLibraries(distribution) {
    for(const server of distribution.servers) {
        for(const module of server.modules.filter(m => m.type === 'Fabric')) {
            const versionManifest = module.subModules?.find(m => m.type === 'VersionManifest')
            if(versionManifest?.artifact?.url == null) continue

            const response = await got.get(versionManifest.artifact.url)
            const manifest = JSON.parse(response.body.replace(/^\uFEFF/, ''))
            const existingIds = new Set((module.subModules ?? []).map(m => m.id))

            for(const library of manifest.libraries ?? []) {
                if(library.name == null || library.url == null || existingIds.has(library.name)) continue

                const libraryPath = MavenUtil.mavenIdentifierAsPath(library.name)
                const repositoryUrl = library.url.endsWith('/') ? library.url : `${library.url}/`
                const libraryUrl = new URL(libraryPath, repositoryUrl).toString()
                let { size, md5 } = library

                // Fabric omits hashes and sizes for intermediary even though it
                // must be on the launch classpath for intermediary-mapped mods.
                if(library.name.startsWith('net.fabricmc:intermediary:') && (size == null || md5 == null)) {
                    const artifact = await got.get(libraryUrl, { responseType: 'buffer' })
                    size = artifact.body.length
                    md5 = crypto.createHash('md5').update(artifact.body).digest('hex')
                }

                if(size == null || md5 == null) continue

                module.subModules.push({
                    id: library.name,
                    name: `Fabric library (${library.name})`,
                    type: 'Library',
                    artifact: {
                        size,
                        MD5: md5,
                        url: libraryUrl
                    }
                })
                existingIds.add(library.name)
            }
        }

        const rewriteLfsUrls = async module => {
            const gitRawPrefix = 'https://raw.githubusercontent.com/Peulim/CobbleverseDistribution/'
            const gitMediaPrefix = 'https://media.githubusercontent.com/media/Peulim/CobbleverseDistribution/'
            if(module.artifact?.url?.startsWith(gitRawPrefix) && module.artifact.size > 1024 * 1024) {
                try {
                    const response = await got.head(module.artifact.url)
                    const contentLength = Number(response.headers['content-length'])
                    if(contentLength > 0 && contentLength <= 200 && contentLength < module.artifact.size) {
                        module.artifact.url = module.artifact.url.replace(gitRawPrefix, gitMediaPrefix)
                    }
                } catch(_error) {
                    // Keep the raw URL if GitHub cannot check the file metadata.
                }
            }
            for(const subModule of module.subModules ?? []) {
                await rewriteLfsUrls(subModule)
            }
        }

        for(const module of server.modules) {
            await rewriteLfsUrls(module)
        }
    }

    return distribution
}

// GitHub's raw response starts with a UTF-8 BOM, which JSON.parse rejects.
// Also add Fabric's external libraries, which its loader manifest declares but
// which this launcher's distribution schema must list explicitly. Use GitHub's
// media host for modpack artifacts so Git LFS files resolve to their real data.
api.pullRemote = async function() {
    try {
        const response = await got.get(exports.REMOTE_DISTRO_URL)
        return {
            data: await includeFabricLibraries(ClientPreferences.protectDistributionPreferences(
                JSON.parse(response.body.replace(/^\uFEFF/, '')),
                ConfigManager.getInstanceDirectory()
            )),
            responseStatus: RestResponseStatus.SUCCESS
        }
    } catch (error) {
        return {
            data: null,
            responseStatus: RestResponseStatus.ERROR,
            error
        }
    }
}

exports.DistroAPI = api
