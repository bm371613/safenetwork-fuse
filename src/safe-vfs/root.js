const path = require('path')  // Cross platform path handling

const debug = require('debug')('safe-fuse:vfs:root')
const NfsHandler = require('./nfs')
const PublicNamesHandler = require('./public-names')

/**
 * VFS RootHandler handles root ('/') and each mounted root container MD
 *
 * The RootHandler for '/' is always mounted to that it can act as the fallback
 * if a handler has not been created for a given item path. In that case it
 * will attempt to create a suitable handler based on the itemPath. This
 * acts like an automount for paths not yet known to the SafeVfs object's
 * pathMap.
 *
 * The RootHandler for '/' creates RootHandler objects for the SAFE root
 * containers (_public, _publicNames, _documents etc) if they don't
 * yet exist in the VFS pathMap, and does so based on the itemPath
 * rather than the mountPath which the other handlers use.
 * This is because when, for example the PublicNames handler creates
 * a ServicesHandler the itemPath is not known beforehand, whereas
 * the RootHandler for '/' always has '/' as both mountPath and itemPath.
 *
 * Each RootHandler instance holds a SafenetworkJs container, except the
 * handler for '/', which does not have a container.
 *
 * NOTE: mountPath is relative to the filesystem mount point, so
 * mountPath '/' corresponds to the path of the filesystem mount point.
 */

class RootHandler {
/**
 * Handle FUSE operations for SAFE default root containers (also implements automount)
 *
 * Constructor
 * @param {SafeVfs} safeVfs       the VFS object
 * @param {String} safePath       mounted path (either '/' or one of '_publicNames', '_public' etc)
 * @param {String} mountPath      where safePath appears relative to filesystem mount point
 * @param {Boolean} lazyInitialise don't create SafenetworkJs container (no effect for a safePath of '/')
 */
  constructor (safeVfs, safePath, mountPath, lazyInitialise) {
    this._safeVfs = safeVfs
    this._safePath = safePath
    this._mountPath = mountPath
    this._lazyInitialise = lazyInitialise

    if (!lazyInitialise) {
      this._container = this.initRootContainer(safePath)
    }
  }

/* TODO delete
    for (var i = 0, size = rootContainerNames.length; i < size ; i++){
      let name = rootContainerNames[i]
      mountRootContainer(path.join(mountPath, name), name)
    }
 */

 /**
  * Creates a RootHandler for a root container and inserts it into mountPath
  * @param  {String} mountPath         where to mount
  * @param  {String} rootContainerName safe root container name (e.g. _public)
  * @param  {String} lazyInitialise    (optional) if true, new handler won't create the safeJs container
  * @return {RootHandler}              the newly created handler
  */
  mountRootContainer (mountPath, rootContainerName, lazyInitialise) {
    if (!lazyInitialise) lazyInitialise = false
    return this._safeVfs.mountContainer(rootContainerName, {'mountPath': mountPath, 'lazyInitialise': lazyInitialise})
  }

  /**
   * get the handler for this._mountPath or item contained by it (create handler if necessary)
   *
   * See class description for more
   *
   * @param  {string} itemPath mounted path
   * @return {VfsHandler}      handler for itemPath (can be this)
   */
  getHandlerFor (itemPath) {
    try {
      if (this._mountPath === itemPath) {
        return this // The handler for itemPath
      }

      let directory = path.dirname(itemPath)
      if (directory === this._mountPath) {
        return this // The handler for itemPath's container
      }

      if (this._mountPath !== '/') {
        // If this RootHandler is not for '/', there should already be an
        // entry in the pathMap so we should not reach here
        throw new Error('unexpected failure - ')
      }

      // This is the RootHandler for '/', so getHandlerFor() will only called
      // if there is no pathMap entry mathcing the start of itemPath. When this
      // happens it attempts to mount the SAFE container which corresponds
      // to the itemPath.
      let itemRoot = path.sep + itemPath.split(path.sep)[0]
      if (!this._safeVfs.safeJs().rootContainerNames.indexOf(itemRoot) === -1) {
        throw new Error('no suitable VFS root handler class for path: ' + itemPath)
      }

      let handler = new RootHandler(this._safeVfs, itemRoot, itemRoot, false)
      if (handler) {
        this._safeVfs.pathMapSet(itemRoot, handler)
      } else {
        throw new Error('failed to create VFS handler for path: ' + itemPath)
      }
    } catch (err) {
      debug('ERROR - ' + err.message)
      throw err
    }
  }

  /**
   * get the SafenetworJs container for the given item
   *
   * This is called by FUSE op handlers, which can then
   * call their corresponding operation on the container.
   *
   * If the item's container is not yet mounted it will automount if:
   * - the mount path starts with a SAFE root container name
   * - the handler has been mounted but the container not initialised (ie lazyInitialise mount)
   *
   * NOTE: this does not return a Promise and will throw an error if the return
   * is not a valid container, so a returned object can always be used immediately
   *
   * @param  {String} itemPath the mountPath of the FUSE item
   * @return {[type]}          a SafenetworkJs container
   */
  getContainer (itemPath) {
    if (this._container) return this._container

    let rootContainerName = path.sep + itemPath.split(path.sep)[1]
    if (this._mountPath === '/') {
      throw new Error('WOOPS why is this being called. TODO I don\'t think this code is needed')
      // The RootHandler for '/' will auto mount a SAFE root container
      // If we get here, the container of the item is not mounted yet
      let mountPath = rootContainerName
      this.mountRootContainer(mountPath, rootContainerName).then((handler) => {
        if (handler) {
          return handler.getContainer(itemPath)
        }
      })
    } else {
      // This RootHandler is for a SAFE root container
      if (this._lazyInitialise) {
        // Make it on demand (lazy)
        return this.initContainer(rootContainerName)
      } else {
        // Either itemPath should not be handled here (so a but elsewhere)
        // or perhaps the constructor has not finished creating containers
        throw new Error('getContainer() - no container object ready for ' + itemPath)
      }
    }

    throw new Error('getContainer() failed for path: ' + itemPath)
  }

  /**
   * Initialise this RootHandler with a standard SAFE root container
   *
   * @param  {String} rootContainerName a root container name (e.g. _public, _publicNames etc)
   * @return {Object}                   a SafenetworkJs container (or VFS RootContainer for '/')
   */
  initRootContainer (rootContainerName) {
    if (this._mountPath === '/') {
      this._container = new RootContainer(this)
      return this._container
    }

    this._safeVfs.safeJs().getSafeContainer(rootContainerName).then((container) => {
      if (container) {
        this._container = container
        return container
      }
    })
  }

  // Fuse operations:
  async readdir (itemPath) {
    debug('RootHandler readdir(' + itemPath + ')')
    return this.getContainer(itemPath).readdir(itemPath).catch((e) => {debug(e.message)})
  }

  async mkdir (itemPath) { debug('TODO mkdir(' + itemPath + ') not implemented'); return {} }
  async statfs (itemPath) { debug('TODO statfs(' + itemPath + ') not implemented'); return {} }

  async getattr (itemPath) {
    debug('RootHandler getattr(' + itemPath + ')')
    return this.getContainer(itemPath).getattr(itemPath).catch((e) => {debug(e.message)})
  }

  async create (itemPath) { debug('TODO create(' + itemPath + ') not implemented'); return {} }
  async open (itemPath) { debug('TODO open(' + itemPath + ') not implemented'); return {} }
  async write (itemPath) { debug('TODO write(' + itemPath + ') not implemented'); return {} }
  async read (itemPath) { debug('TODO read(' + itemPath + ') not implemented'); return {} }
  async unlink (itemPath) { debug('TODO unlink(' + itemPath + ') not implemented'); return {} }
  async rmdir (itemPath) { debug('TODO rmdir(' + itemPath + ') not implemented'); return {} }
  async rename (itemPath) { debug('TODO rename(' + itemPath + ') not implemented'); return {} }
  async ftruncate (itemPath) { debug('TODO ftruncate(' + itemPath + ') not implemented'); return {} }
  async mknod (itemPath) { debug('TODO mknod(' + itemPath + ') not implemented'); return {} }
  async utimens (itemPath) { debug('TODO utimens(' + itemPath + ') not implemented'); return {} }
}

/**
 * A special handler object for the root ('/')
 *
 * This handler supports operations on '/' as reflected
 * in the VFS Path Map
 */
class RootContainer {
  constructor (rootHandler) {
    this._handler = rootHandler

    // Helpers
    this.vfs = this._handler._safeVfs
    this.safeJs = this._handler._safeVfs.safeJs()
  }

  // Fuse operations:
  async readdir (itemPath) {
    debug('RootContainer readdir(' + itemPath + ')')
    if (itemPath !== '/') throw new Error('Error - RootContainer should only handle the root path: \'/\'')

    let listing = []
    this.vfs.pathMap().forEach((value, key, pathMap) => {
      key = key.substring(key.split(path.sep)[0].length + 1)
      if (key.length) {
        listing.push(key)
      }
    })
    return listing
  }

  async mkdir (itemPath) { debug('TODO RootContainer mkdir(' + itemPath + ') not implemented'); return {} }
  async statfs (itemPath) { debug('TODO RootContainer statfs(' + itemPath + ') not implemented'); return {} }
  async getattr (itemPath) { debug('TODO RootContainer getattr(' + itemPath + ') not implemented'); return {} }
  async create (itemPath) { debug('TODO RootContainer create(' + itemPath + ') not implemented'); return {} }
  async open (itemPath) { debug('TODO RootContainer open(' + itemPath + ') not implemented'); return {} }
  async write (itemPath) { debug('TODO RootContainer write(' + itemPath + ') not implemented'); return {} }
  async read (itemPath) { debug('TODO RootContainer read(' + itemPath + ') not implemented'); return {} }
  async unlink (itemPath) { debug('TODO RootContainer unlink(' + itemPath + ') not implemented'); return {} }
  async rmdir (itemPath) { debug('TODO RootContainer rmdir(' + itemPath + ') not implemented'); return {} }
  async rename (itemPath) { debug('TODO RootContainer rename(' + itemPath + ') not implemented'); return {} }
  async ftruncate (itemPath) { debug('TODO RootContainer ftruncate(' + itemPath + ') not implemented'); return {} }
  async mknod (itemPath) { debug('TODO RootContainer mknod(' + itemPath + ') not implemented'); return {} }
  async utimens (itemPath) { debug('TODO RootContainer utimens(' + itemPath + ') not implemented'); return {} }
}

module.exports = RootHandler
