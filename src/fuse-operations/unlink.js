const Fuse = require('fuse-bindings')
const explain = require('explain-error')
const debug = require('debug')('safe-fuse:ops')

module.exports = (ipfs) => {
  return {
    unlink (itemPath, reply) {
      debug('unlink(\'%s\')', itemPath)

      ipfs.files.rm(itemPath, (err) => {
        if (err) {
          err = explain(err, 'Failed to delete file')
          debug(err)
          return reply(Fuse.EREMOTEIO)
        }
        reply(0)
      })
    }
  }
}
