import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { migrateLegacyLayout } from '../lib/runtime-paths.mjs'
import { createRuntimePaths } from '../lib/runtime-paths.mjs'

async function fixture() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-legacy-'))
  const paths = createRuntimePaths(home)
  await fs.mkdir(path.join(paths.rootDir, 'config'), { recursive: true })
  await fs.mkdir(path.join(paths.rootDir, 'storage'), { recursive: true })
  await fs.writeFile(path.join(paths.rootDir, 'config', 'boss.json'), '{"openingMessage":"legacy"}\n')
  await fs.writeFile(path.join(paths.rootDir, 'storage', 'state.json'), '{"ready":true}\n')
  await fs.writeFile(path.join(paths.rootDir, 'storage', 'public.db'), 'legacy database')
  return { home, paths }
}

{
  const { home, paths } = await fixture()
  try {
    await migrateLegacyLayout(paths)
    assert.equal(await fs.readFile(path.join(paths.configDir, 'boss.json'), 'utf8'), '{"openingMessage":"legacy"}\n')
    assert.equal(await fs.readFile(path.join(paths.storageDir, 'state.json'), 'utf8'), '{"ready":true}\n')
    assert.equal(await fs.readFile(paths.databaseFile, 'utf8'), 'legacy database')
    assert.equal(await fs.readlink(path.join(paths.rootDir, 'config')), 'data/config')
    assert.equal(await fs.readlink(path.join(paths.rootDir, 'storage')), 'data/storage')
    assert.equal(await fs.readlink(path.join(paths.storageDir, 'public.db')), '../database.sqlite')
    assert.equal((await fs.stat(paths.rootDir)).mode & 0o777, 0o700)
    assert.equal((await fs.stat(path.join(paths.configDir, 'boss.json'))).mode & 0o777, 0o600)
    assert.equal((await fs.stat(path.join(paths.storageDir, 'state.json'))).mode & 0o777, 0o600)
    assert.equal((await fs.stat(paths.databaseFile)).mode & 0o777, 0o600)
    assert.equal((await fs.stat(paths.layoutVersionFile)).mode & 0o777, 0o600)

    await migrateLegacyLayout(paths)
    assert.equal(await fs.readlink(path.join(paths.rootDir, 'config')), 'data/config')
    await fs.symlink('/tmp', path.join(paths.configDir, 'nested-link'))
    await assert.rejects(migrateLegacyLayout(paths), /symbolic link/)
  } finally {
    await fs.rm(home, { recursive: true, force: true })
  }
}

{
  const { home, paths } = await fixture()
  try {
    await fs.rm(path.join(paths.rootDir, 'config'), { recursive: true })
    await fs.symlink('/tmp', path.join(paths.rootDir, 'config'))
    await assert.rejects(migrateLegacyLayout(paths), /outside expected data directory/)
    await assert.rejects(fs.lstat(paths.layoutVersionFile), { code: 'ENOENT' })
    assert.equal(await fs.readlink(path.join(paths.rootDir, 'config')), '/tmp')
  } finally {
    await fs.rm(home, { recursive: true, force: true })
  }
}

for (const location of ['config/nested', 'storage/public.db']) {
  const { home, paths } = await fixture()
  try {
    const linkPath = path.join(paths.rootDir, location)
    await fs.rm(linkPath, { recursive: true, force: true })
    await fs.symlink('/tmp', linkPath)
    await assert.rejects(migrateLegacyLayout(paths), /symbolic link/)
    await assert.rejects(fs.lstat(paths.layoutVersionFile), { code: 'ENOENT' })
  } finally {
    await fs.rm(home, { recursive: true, force: true })
  }
}

{
  const { home, paths } = await fixture()
  const backupStorage = `${path.join(paths.rootDir, 'storage')}.migration-backup`
  const injectedFs = new Proxy(fs, {
    get(target, property) {
      if (property !== 'rm') return target[property]
      return async (targetPath, options) => {
        if (targetPath === backupStorage) throw new Error('injected post-commit cleanup failure')
        return target.rm(targetPath, options)
      }
    }
  })
  try {
    await assert.rejects(migrateLegacyLayout(paths, { fsOps: injectedFs }), /post-commit cleanup failure/)
    assert.equal(await fs.readlink(path.join(paths.rootDir, 'config')), 'data/config')
    assert.equal(await fs.readFile(path.join(paths.configDir, 'boss.json'), 'utf8'), '{"openingMessage":"legacy"}\n')
    assert.equal(await fs.readFile(paths.layoutVersionFile, 'utf8'), '1\n')
  } finally {
    await fs.rm(home, { recursive: true, force: true })
  }
}

{
  const { home, paths } = await fixture()
  const configPath = path.join(paths.rootDir, 'config')
  const storagePath = path.join(paths.rootDir, 'storage')
  const backupStorage = `${storagePath}.migration-backup`
  const injectedFs = new Proxy(fs, {
    get(target, property) {
      if (property !== 'rename') return target[property]
      return async (source, destination) => {
        if (source === storagePath && destination === backupStorage) throw new Error('injected second rename failure')
        return target.rename(source, destination)
      }
    }
  })
  try {
    await assert.rejects(migrateLegacyLayout(paths, { fsOps: injectedFs }), /injected second rename failure/)
    assert.equal(await fs.readFile(path.join(configPath, 'boss.json'), 'utf8'), '{"openingMessage":"legacy"}\n')
    assert.equal(await fs.readFile(path.join(storagePath, 'state.json'), 'utf8'), '{"ready":true}\n')
  } finally {
    await fs.rm(home, { recursive: true, force: true })
  }
}

{
  const { home, paths } = await fixture()
  const events = []
  const injectedFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'open') return async (targetPath, ...args) => {
        const handle = await target.open(targetPath, ...args)
        return new Proxy(handle, { get(fileHandle, key) {
          if (key === 'sync') return async () => { events.push(`sync:${targetPath}`); return fileHandle.sync() }
          const value = fileHandle[key]
          return typeof value === 'function' ? value.bind(fileHandle) : value
        } })
      }
      if (['rename', 'symlink'].includes(property)) return async (...args) => {
        events.push(`${String(property)}:${args[1]}`)
        return target[property](...args)
      }
      return target[property]
    }
  })
  try {
    await migrateLegacyLayout(paths, { fsOps: injectedFs })
    const configLink = events.indexOf(`symlink:${path.join(paths.rootDir, 'config')}`)
    const markerRename = events.indexOf(`rename:${paths.layoutVersionFile}`)
    const dataSyncs = events.flatMap((event, index) => event === `sync:${paths.dataDir}` ? [index] : [])
    assert(configLink >= 0 && markerRename > configLink)
    assert(dataSyncs.some((index) => index > configLink && index < markerRename))
    assert(dataSyncs.some((index) => index > markerRename))
    const storageDbLink = events.indexOf(`symlink:${path.join(paths.storageDir, 'public.db')}`)
    assert(events.slice(storageDbLink + 1).includes(`sync:${paths.storageDir}`))
  } finally {
    await fs.rm(home, { recursive: true, force: true })
  }
}


{
  const { home, paths } = await fixture()
  const injectedFs = new Proxy(fs, {
    get(target, property) {
      if (property !== 'copyFile') return target[property]
      return async (source, destination) => {
        await target.copyFile(source, destination)
        if (destination.endsWith('database.sqlite')) await target.appendFile(destination, 'corrupt')
      }
    }
  })
  try {
    await assert.rejects(migrateLegacyLayout(paths, { fsOps: injectedFs }), /verification failed/)
    assert.equal(await fs.readFile(path.join(paths.rootDir, 'storage', 'public.db'), 'utf8'), 'legacy database')
  } finally {
    await fs.rm(home, { recursive: true, force: true })
  }
}

console.log('ggr backend legacy layout check passed')
