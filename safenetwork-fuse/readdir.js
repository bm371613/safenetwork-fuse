const Fuse = require('fuse-bindings')
const explain = require('explain-error')
const debug = require('debug')('ipfs-fuse:readdir')

const fakeReadDir = {
  '/': ['one', 'two', 'three'],
  '/one': ['four', 'five', 'happybeing']
}

const fakeGetattr = {
  '/': 'directory',
  '/one': 'directory',
  '/two': 'file',
  '/three': 'file',
  '/one/four': 'file',
  '/one/five': 'file',
  '/one/happybeing': 'file'
}
/*
 * Pseudocode for a SAFE VFS implementation:
 *
module.exports = (safeVfs) => {
  return {
    readdir (path, cb) {
      debug({ path })
      try {
        // TODO: Convert this to Promises
        let listing = safeVfs.fuseHandler(path).readdir(path, (err, files) => {
        if (err) {
          err = explain(err, 'Failed to readdir path: ' + path)
          debug(err)
          return reply(Fuse.EREMOTEIO)
        }
        reply(0, files.map(f => f.name || f.hash))
      })
    }
  }
}
 */
module.exports = (ipfs) => {
  return {
    readdir (path, reply) {
      debug({ path })

      let listing = fakeReadDir[path]
      if (listing)
        reply(0, listing)
      else
        reply(Fuse.EREMOTEIO)

      /*
      ipfs.files.ls(path, (err, files) => {
        if (err) {
          err = explain(err, 'Failed to ls path')
          debug(err)
          return reply(Fuse.EREMOTEIO)
        }
        reply(0, files.map(f => f.name || f.hash))
      })*/
    }
  }
}
