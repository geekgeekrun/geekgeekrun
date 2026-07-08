import { app, dialog, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import { runCommon } from './run-common'
import { createDaemonController, TASKS } from '../../../../ggr-controller/index.mjs'
import { daemonEE, sendToDaemon } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'
import { allowMainWindowQuit, hideMainWindow, showMainWindow } from '../window/mainWindow'

let tray: Tray | null = null
let isHeadlessEnabled = process.env.GGR_HEADLESS === 'true'
let isBossRunning = false
let isBossStopping = false

const BOSS_WORKER_ID = TASKS.AUTO_CHAT.workerId
const controller = createDaemonController({
  sendToDaemon,
  runTask: runCommon
})

function getTrayIcon() {
  const iconPath = path.join(app.getAppPath(), 'resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
  icon.setTemplateImage(process.platform === 'darwin')
  return icon
}

function setHeadlessEnabled(value: boolean) {
  isHeadlessEnabled = value
  process.env.GGR_HEADLESS = String(value)
  if (value) {
    // 开启 headless → 隐藏 Dashboard
    hideMainWindow()
    console.log('[GeekGeekRun] Headless 模式：Dashboard 已隐藏，日志输出到终端')
  } else {
    // 关闭 headless → 显示 Dashboard
    showMainWindow()
  }
  refreshTrayMenu()
}

async function showTrayError(error: unknown) {
  await dialog.showMessageBox({
    type: 'error',
    message: error instanceof Error ? error.message : String(error)
  })
}

async function getBossWorker() {
  const status = await controller.getTaskStatus(BOSS_WORKER_ID)
  return status.worker as { workerId?: string; pid?: number } | null
}

function syncBossWorkerState(workers: Array<{ workerId?: string }> = []) {
  isBossRunning = workers.some((worker) => worker.workerId === BOSS_WORKER_ID)
  if (!isBossRunning) {
    isBossStopping = false
  }
  refreshTrayMenu()
}

async function syncBossWorkerStateFromDaemon() {
  const status = await controller.getTaskStatus(BOSS_WORKER_ID)
  syncBossWorkerState(status.worker ? [status.worker] : [])
}

function subscribeDaemonEvents() {
  daemonEE.on('message', (message) => {
    if (message.type === 'status') {
      syncBossWorkerState(message.workers)
      return
    }

    if (message.workerId !== BOSS_WORKER_ID) {
      return
    }

    if (message.type === 'worker-exited' || message.type === 'worker-disconnected') {
      isBossRunning = Boolean(message.restarting)
      isBossStopping = false
      refreshTrayMenu()
    }
  })
}

async function startBossAgent() {
  process.env.GGR_HEADLESS = String(isHeadlessEnabled)
  const { isAlreadyRunning } = await controller.startTask(BOSS_WORKER_ID)
  isBossRunning = true
  refreshTrayMenu()
  await dialog.showMessageBox({
    type: 'info',
    message: isAlreadyRunning ? '自动开聊已经在运行' : '自动开聊已启动'
  })
}

async function stopBossAgent() {
  if (!(await getBossWorker())) {
    isBossRunning = false
    refreshTrayMenu()
    await dialog.showMessageBox({ type: 'info', message: '自动开聊没有在运行' })
    return
  }

  isBossStopping = true
  refreshTrayMenu()
  await controller.stopTask(BOSS_WORKER_ID)
  await dialog.showMessageBox({ type: 'info', message: '自动开聊停止请求已发送' })
}

async function showBossAgentStatus() {
  const worker = await getBossWorker()
  await dialog.showMessageBox({
    type: 'info',
    message: worker
      ? `自动开聊运行中${worker.pid ? `\nPID: ${worker.pid}` : ''}`
      : '自动开聊未运行'
  })
}

function refreshTrayMenu() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '开始自动开聊',
        enabled: !isBossRunning,
        click: () => void startBossAgent().catch(showTrayError)
      },
      {
        label: isBossStopping ? '停止自动开聊中...' : '停止自动开聊',
        enabled: isBossRunning && !isBossStopping,
        click: () => void stopBossAgent().catch(showTrayError)
      },
      {
        label: isBossRunning ? '查看运行状态：运行中' : '查看运行状态：未运行',
        click: () => void showBossAgentStatus().catch(showTrayError)
      },
      {
        label: 'Headless 模式',
        type: 'checkbox',
        checked: isHeadlessEnabled,
        click: (item) => setHeadlessEnabled(item.checked)
      },
      { type: 'separator' },
      {
        label: '打开 Dashboard',
        click: () => showMainWindow()
      },
      {
        label: '隐藏 Dashboard',
        click: () => hideMainWindow()
      },
      { type: 'separator' },
      {
        label: '退出 GeekGeekRun',
        click: () => {
          allowMainWindowQuit()
          app.quit()
        }
      }
    ])
  )
}

export function initTray() {
  if (tray) {
    return tray
  }

  tray = new Tray(getTrayIcon())
  tray.setToolTip('GeekGeekRun 牛人快跑')
  subscribeDaemonEvents()
  refreshTrayMenu()
  void syncBossWorkerStateFromDaemon().catch(showTrayError)

  tray.on('click', () => showMainWindow())
  return tray
}
