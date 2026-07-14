import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVersionStore } from '../lib/version-store.mjs'
let launchd
try {
  launchd = await import('../lib/launchd.mjs')
} catch (error) {
  assert.fail(`launchd supervisor module must exist: ${error.message}`)
}
const { createLaunchAgentPlist, installLaunchdSupervisor } = launchd

const temporaryHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-launchd-home-'))
const bootstrapSource = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-launchd-bootstrap-'))
const bootstrapVersion = '1.0.0'
await fs.mkdir(path.join(bootstrapSource, 'bin'), { recursive: true })
await fs.writeFile(path.join(bootstrapSource, 'bin', 'node'), '#!/bin/sh\n', { mode: 0o700 })
await fs.writeFile(path.join(bootstrapSource, 'server.mjs'), 'export {}\n', { mode: 0o600 })

const runtimePath = path.join(temporaryHome, '.geekgeekrun', 'supervisor', bootstrapVersion)
const plist = createLaunchAgentPlist({
  homeDirectory: temporaryHome,
  bootstrapDirectory: runtimePath,
  runtimeDirectory: path.join(temporaryHome, '.geekgeekrun'),
  label: 'com.geekgeekrun.ggrd'
})
assert.match(plist, /<string>com\.geekgeekrun\.ggrd<\/string>/)
assert.match(plist, new RegExp(`<string>${runtimePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/bin/node</string>`))
assert.match(plist, new RegExp(`<string>${runtimePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/server\\.mjs</string>`))
assert.match(plist, /\.geekgeekrun\/logs\/ggrd\.stdout\.log/)
assert.match(plist, /\.geekgeekrun\/logs\/ggrd\.stderr\.log/)
assert.doesNotMatch(plist, /\/bin\/(?:ba)?sh|\$\(|`|[;&|]/, 'LaunchAgent arguments must not invoke a shell')

const launchctlCalls = []
const result = await installLaunchdSupervisor({
  homeDirectory: temporaryHome,
  bootstrapSource,
  bootstrapVersion,
  uid: 501,
  runLaunchctl: async (command, args) => launchctlCalls.push([command, args])
})
assert.equal(result.label, 'com.geekgeekrun.ggrd')
assert.equal(result.bootstrapDirectory, runtimePath)
assert.equal(await fs.readFile(path.join(runtimePath, 'server.mjs'), 'utf8'), 'export {}\n')
assert.ok(await fs.stat(path.join(temporaryHome, 'Library', 'LaunchAgents', 'com.geekgeekrun.ggrd.plist')))
assert.ok(launchctlCalls.some(([command, args]) => command === 'bootstrap' && Array.isArray(args) && args[0] === 'gui/501'))
assert.ok(launchctlCalls.every(([, args]) => Array.isArray(args) && args.every((argument) => typeof argument === 'string')))
assert.ok(launchctlCalls.every(([, args]) => !args.some((argument) => /\/bin\/(?:ba)?sh|\$\(|`/.test(argument))))
assert.doesNotMatch(JSON.stringify(result), /Library\/LaunchAgents/, 'the result must not expose launch-agent paths to callers')
assert.notEqual(path.join(temporaryHome, 'Library', 'LaunchAgents'), path.join(os.homedir(), 'Library', 'LaunchAgents'), 'test installation must use a temporary home')

const backendStore = createVersionStore(path.join(temporaryHome, '.geekgeekrun'))
await backendStore.stage('1.0.0', async (directory) => {
  await fs.mkdir(path.join(directory, 'bin'), { recursive: true })
  await fs.mkdir(path.join(directory, 'app'), { recursive: true })
  await fs.writeFile(path.join(directory, 'bin', 'node'), '#!/bin/sh\n')
  await fs.writeFile(path.join(directory, 'app', 'server.mjs'), 'export {}\n')
})
await backendStore.activate('1.0.0')
assert.equal(await backendStore.current(), '1.0.0', 'the temporary home must hold the installed backend version')

await fs.rm(temporaryHome, { recursive: true, force: true })
await fs.rm(bootstrapSource, { recursive: true, force: true })
console.log('ggrd launchd check passed')
