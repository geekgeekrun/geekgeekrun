import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8')
}

const traySource = await read('packages/ui/src/main/features/tray.ts')
assert.match(traySource, /import\s+\{[^}]*Tray[^}]*\}\s+from ['"]electron['"]/, 'tray feature must import Electron Tray')
assert.match(traySource, /new\s+Tray\(/, 'tray feature must create a Tray instance')
assert.match(traySource, /setContextMenu\(/, 'tray feature must expose a context menu')
assert.match(traySource, /runCommon\(\{\s*mode:\s*BOSS_WORKER_ID\s*\}\)/, 'tray must start auto chat through the existing runner')
assert.match(traySource, /type:\s*['"]stop-worker['"]/, 'tray must expose a stop action through the daemon')
assert.match(traySource, /type:\s*['"]get-status['"]/, 'tray must expose a status action through the daemon')
assert.match(traySource, /daemonEE\.on\(['"]message['"]/, 'tray must subscribe to daemon events')
assert.match(traySource, /message\.type\s*===\s*['"]status['"]/, 'tray must update from daemon status broadcasts')
assert.match(traySource, /worker-exited/, 'tray must react to worker exit events')
assert.match(traySource, /worker-disconnected/, 'tray must react to worker disconnect events')
assert.match(traySource, /enabled:\s*!isBossRunning/, 'tray start action must reflect running state')
assert.match(traySource, /enabled:\s*isBossRunning\s*&&\s*!isBossStopping/, 'tray stop action must reflect running state')
assert.match(traySource, /process\.env\.GGR_HEADLESS/, 'tray must control headless mode through GGR_HEADLESS')
assert.match(traySource, /label:\s*['"]开始自动开聊['"]/, 'tray must show start auto chat action')
assert.match(traySource, /停止自动开聊/, 'tray must show stop auto chat action')
assert.match(traySource, /查看运行状态/, 'tray must show status action')
assert.match(traySource, /label:\s*['"]Headless 模式['"]/, 'tray must show headless toggle')
assert.match(traySource, /syncBossWorkerStateFromDaemon\(\)/, 'tray must load initial worker state from daemon')

const openSettingWindowSource = await read('packages/ui/src/main/flow/OPEN_SETTING_WINDOW/index.ts')
assert.match(openSettingWindowSource, /initTray\(/, 'setting window flow must initialize the tray')

const mainWindowSource = await read('packages/ui/src/main/window/mainWindow.ts')
assert.match(mainWindowSource, /function\s+showMainWindow\(/, 'main window module must expose showMainWindow for tray actions')
assert.match(mainWindowSource, /function\s+hideMainWindow\(/, 'main window module must expose hideMainWindow for tray actions')

console.log('ui static check passed')
