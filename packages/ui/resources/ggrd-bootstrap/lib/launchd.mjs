import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn as spawnChild } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export const SUPERVISOR_LABEL = 'com.geekgeekrun.ggrd'

function xml(value) {
  return String(value).replace(/[<&>"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character])
}

function plistKey(name, value) {
  return `  <key>${xml(name)}</key>\n  <string>${xml(value)}</string>`
}

function assertInsideHome(homeDirectory, target) {
  const relative = path.relative(homeDirectory, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('launchd paths must be user-scoped')
}

async function privateDirectory(homeDirectory, target) {
  assertInsideHome(homeDirectory, target)
  const home = await fs.lstat(homeDirectory)
  if (!home.isDirectory() || home.isSymbolicLink()) throw new Error('home directory is unsafe')
  let current = homeDirectory
  for (const component of path.relative(homeDirectory, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, component)
    let info = await fs.lstat(current).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (!info) {
      await fs.mkdir(current, { mode: 0o700 })
      info = await fs.lstat(current)
    }
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`unsafe supervisor directory: ${current}`)
    await fs.chmod(current, 0o700)
  }
}

async function atomicWrite(target, contents) {
  const temporary = `${target}.${randomUUID()}.next`
  const handle = await fs.open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(contents)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(temporary, target)
}

async function copyBootstrapAtomically({ source, destination }) {
  const present = await fs.lstat(destination).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
  if (present) {
    if (!present.isDirectory() || present.isSymbolicLink()) throw new Error('existing supervisor bootstrap is unsafe')
    return
  }
  const temporary = `${destination}.${randomUUID()}.next`
  try {
    await fs.cp(source, temporary, { recursive: true, dereference: true, errorOnExist: true })
    await fs.rename(temporary, destination)
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

export function createLaunchAgentPlist({
  homeDirectory = os.homedir(),
  bootstrapDirectory,
  runtimeDirectory = path.join(homeDirectory, '.geekgeekrun'),
  label = SUPERVISOR_LABEL,
  httpsProxy, electronVersion
} = {}) {
  if (!path.isAbsolute(homeDirectory) || !path.isAbsolute(bootstrapDirectory) || !path.isAbsolute(runtimeDirectory)) {
    throw new TypeError('launchd paths must be absolute')
  }
  assertInsideHome(homeDirectory, bootstrapDirectory)
  assertInsideHome(homeDirectory, runtimeDirectory)
  if (label !== SUPERVISOR_LABEL) throw new TypeError('unexpected launchd label')
  if (httpsProxy !== undefined) {
    const url = new URL(httpsProxy)
    if (url.protocol !== 'https:') throw new TypeError('HTTPS proxy must use https')
  }
  if (electronVersion !== undefined && (typeof electronVersion !== 'string' || !electronVersion)) throw new TypeError('Electron version must be a non-empty string')
  const stdout = path.join(runtimeDirectory, 'logs', 'ggrd.stdout.log')
  const stderr = path.join(runtimeDirectory, 'logs', 'ggrd.stderr.log')
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    plistKey('Label', label),
    '  <key>ProgramArguments</key>',
    '  <array>',
    `    <string>${xml(path.join(bootstrapDirectory, 'runtime', 'bin', 'node'))}</string>`,
    '    <string>--use-env-proxy</string>',
    `    <string>${xml(path.join(bootstrapDirectory, 'server.mjs'))}</string>`,
    '  </array>',
    plistKey('WorkingDirectory', runtimeDirectory),
    plistKey('StandardOutPath', stdout),
    plistKey('StandardErrorPath', stderr),
    '  <key>RunAtLoad</key>',
    '  <true/>'
  ]
  if (httpsProxy || electronVersion) {
    const environment = []
    if (httpsProxy) environment.push(plistKey('HTTPS_PROXY', httpsProxy))
    if (electronVersion) environment.push(plistKey('GGR_ELECTRON_VERSION', electronVersion))
    lines.push('  <key>EnvironmentVariables</key>', '  <dict>', ...environment, '  </dict>')
  }
  lines.push('</dict>', '</plist>', '')
  return lines.join('\n')
}

export async function runLaunchctl(command, args) {
  if (!['bootstrap', 'bootout', 'kickstart'].includes(command) || !Array.isArray(args) || args.some((argument) => typeof argument !== 'string')) {
    throw new TypeError('launchctl must receive an allowlisted command and argument array')
  }
  await new Promise((resolve, reject) => {
    const child = spawnChild('/bin/launchctl', [command, ...args], { stdio: ['ignore', 'ignore', 'pipe'], shell: false })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) return resolve()
      const error = Object.assign(new Error(`launchctl ${command} failed with exit code ${code}`), { code: /service already loaded|already bootstrapped/i.test(stderr) ? 'LAUNCHCTL_ALREADY_LOADED' : 'LAUNCHCTL_FAILED', stderr })
      reject(error)
    })
  })
}

function alreadyLoaded(error) {
  return error?.code === 'LAUNCHCTL_ALREADY_LOADED'
}

export async function installLaunchdSupervisor({
  homeDirectory = os.homedir(),
  bootstrapSource,
  bootstrapVersion,
  uid = process.getuid?.(),
  httpsProxy,
  electronVersion,
  runLaunchctl: invokeLaunchctl = runLaunchctl
} = {}) {
  if (process.platform !== 'darwin') throw new Error('launchd supervisor installation is supported only on macOS')
  if (!path.isAbsolute(homeDirectory) || !path.isAbsolute(bootstrapSource)) throw new TypeError('homeDirectory and bootstrapSource must be absolute')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(bootstrapVersion ?? '')) throw new TypeError('bootstrapVersion is invalid')
  if (!Number.isInteger(uid) || uid < 0) throw new TypeError('a user uid is required')
  const runtimeDirectory = path.join(homeDirectory, '.geekgeekrun')
  const supervisorDirectory = path.join(runtimeDirectory, 'supervisor')
  const bootstrapDirectory = path.join(supervisorDirectory, bootstrapVersion)
  const launchAgentsDirectory = path.join(homeDirectory, 'Library', 'LaunchAgents')
  const plistPath = path.join(launchAgentsDirectory, `${SUPERVISOR_LABEL}.plist`)
  await privateDirectory(homeDirectory, runtimeDirectory)
  await privateDirectory(homeDirectory, path.join(runtimeDirectory, 'logs'))
  await privateDirectory(homeDirectory, supervisorDirectory)
  await privateDirectory(homeDirectory, launchAgentsDirectory)
  await copyBootstrapAtomically({ source: bootstrapSource, destination: bootstrapDirectory })
  await atomicWrite(plistPath, createLaunchAgentPlist({ homeDirectory, bootstrapDirectory, runtimeDirectory, httpsProxy, electronVersion }))
  try {
    await invokeLaunchctl('bootstrap', [`gui/${uid}`, plistPath])
  } catch (error) {
    if (!alreadyLoaded(error)) throw error
    const service = `gui/${uid}/${SUPERVISOR_LABEL}`
    await invokeLaunchctl('bootout', [service])
    await invokeLaunchctl('bootstrap', [`gui/${uid}`, plistPath])
    await invokeLaunchctl('kickstart', ['-k', service])
  }
  return Object.freeze({ label: SUPERVISOR_LABEL, bootstrapDirectory })
}
