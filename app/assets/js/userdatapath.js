const fs = require('fs-extra')
const path = require('path')

const EXISTING_USER_DATA_FOLDER = 'Helios Launcher'

exports.preserveExistingUserDataPath = function(electronApp) {
    const userDataPath = path.join(electronApp.getPath('appData'), EXISTING_USER_DATA_FOLDER)
    fs.ensureDirSync(userDataPath)
    electronApp.setPath('userData', userDataPath)
    return userDataPath
}
