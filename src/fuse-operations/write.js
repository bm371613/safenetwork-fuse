const Fuse = require('fuse-bindings')
const explain = require('explain-error')
const debug = require('debug')('safe-fuse-op:write')

module.exports = (ipfs) => {
  return {
    write (itemPath, fd, buf, len, pos, reply) {
      debug({ itemPath })

      ipfs.files.write(itemPath, buf, { offset: pos, count: len }, (err) => {
        if (err) {
          err = explain(err, 'Failed to write to file')
          debug(err)
          return reply(Fuse.EREMOTEIO)
        }
        reply(len)
      })
    }
  }
}
