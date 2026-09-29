const { createHash } = require('crypto')

exports.isValidUsername = name => typeof name === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(name)

// Java UUID.nameUUIDFromBytes uses MD5 with UUID version 3 and RFC 4122 variant bits.
// Preserve case: OfflinePlayer:Steve and OfflinePlayer:steve are different identities.
exports.uuidForName = function(name){
    if(!exports.isValidUsername(name)) throw new Error('Use de 3 a 16 letras, números ou sublinhado (_).')
    const bytes = createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest()
    bytes[6] = (bytes[6] & 0x0f) | 0x30
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}
