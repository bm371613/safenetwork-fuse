const Fuse = require('fuse-bindings')
const explain = require('explain-error')
const debug = require('debug')('safe-fuse:ops:readdir')

module.exports = (safeVfs) => {
  return {
    readdir (itemPath, reply) {
      try {
        debug({ itemPath })
        safeVfs.getHandler(itemPath).readdir(itemPath).then((result) => {
          reply(0, result)
        })
      } catch (err) {
        let e = explain(err, 'Failed to readdir: ' + itemPath)
        debug(e)
        reply(Fuse.EREMOTEIO)
      }
    }
  }
}
