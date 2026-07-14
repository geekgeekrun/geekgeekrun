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

async function privateDirectory(target) {
  await fs.mkdir(target, { recursive: true, mode: 0o700 })
  await fs.chmod(target, 0o700)
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
  httpsProxy
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
    `    <string>${xml(path.join(bootstrapDirectory, 'bin', 'node'))}</string>`,
    `    <string>${xml(path.join(bootstrapDirectory, 'server.mjs'))}</string>`,
    '  </array>',
    plistKey('WorkingDirectory', runtimeDirectory),
    plistKey('StandardOutPath', stdout),
    plistKey('StandardErrorPath', stderr),
    '  <key>RunAtLoad</key>',
    '  <true/>'
  ]
  if (httpsProxy) {
    lines.push('  <key>EnvironmentVariables</key>', '  <dict>', plistKey('HTTPS_PROXY', httpsProxy), '  </dict>')
  }
  lines.push('</dict>', '</plist>', '')
  return lines.join('\n')
}

export async function runLaunchctl(command, args) {
  if (!['bootstrap', 'kickstart'].includes(command) || !Array.isArray(args) || args.some((argument) => typeof argument !== 'string')) {
    throw new TypeError('launchctl must receive an allowlisted command and argument array')
  }
  await new Promise((resolve, reject) => {
    const child = spawnChild('/bin/launchctl', [command, ...args], { stdio: 'ignore', shell: false })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`launchctl ${command} failed with exit code ${code}`)))
  })
}

export async function installLaunchdSupervisor({
  homeDirectory = os.homedir(),
  bootstrapSource,
  bootstrapVersion,
  uid = process.getuid?.(),
  httpsProxy,
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
  await privateDirectory(runtimeDirectory)
  await privateDirectory(path.join(runtimeDirectory, 'logs'))
  await privateDirectory(supervisorDirectory)
  await privateDirectory(launchAgentsDirectory)
  await copyBootstrapAtomically({ source: bootstrapSource, destination: bootstrapDirectory })
  await atomicWrite(plistPath, createLaunchAgentPlist({ homeDirectory, bootstrapDirectory, runtimeDirectory, httpsProxy }))
  try {
    await invokeLaunchctl('bootstrap', [`gui/${uid}`, plistPath])
  } catch (error) {
    await invokeLaunchctl('kickstart', ['-k', `gui/${uid}/${SUPERVISOR_LABEL}`])
  }
  return Object.freeze({ label: SUPERVISOR_LABEL, bootstrapDirectory })
}
