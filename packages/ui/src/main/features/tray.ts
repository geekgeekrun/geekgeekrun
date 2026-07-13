import { app, dialog, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import { runCommon } from './run-common'
import { requestBackend } from '../backend/client'
import { backendEvents } from '../backend/events'
import { allowMainWindowQuit, hideMainWindow, showMainWindow } from '../window/mainWindow'

let tray: Tray | null = null
let isHeadlessEnabled = process.env.GGR_HEADLESS === 'true'
let isBossRunning = false
let isBossStopping = false
let pendingApprovalCount = 0

const BOSS_WORKER_ID = 'geekAutoStartWithBossMain'
type TaskSummary = { workerId?: string; pid?: number }
type Approval = Record<string, unknown> & { id: string }

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
  const workers = await requestBackend<TaskSummary[]>('task.list')
  return workers.find((worker) => worker.workerId === BOSS_WORKER_ID) ?? null
}

function syncBossWorkerState(workers: Array<{ workerId?: string }> = []) {
  isBossRunning = workers.some((worker) => worker.workerId === BOSS_WORKER_ID)
  if (!isBossRunning) {
    isBossStopping = false
  }
  refreshTrayMenu()
}

async function syncBossWorkerStateFromDaemon() {
  syncBossWorkerState(await requestBackend<TaskSummary[]>('task.list'))
}

async function syncApprovalQueueState() {
  pendingApprovalCount = (await requestBackend<Approval[]>('approval.list')).length
  refreshTrayMenu()
}

function formatApprovalDetail(request: Record<string, unknown>, index: number, total: number) {
  return [
    `${index + 1}/${total}`,
    request.company ? `公司：${request.company}` : '',
    request.jobTitle ? `岗位：${request.jobTitle}` : '',
    request.hrName ? `HR：${request.hrName}` : '',
    '',
    `HR 问题：${request.latestHrMessage ?? ''}`,
    request.draftReply ? `AI 草稿：${request.draftReply}` : 'AI 草稿：暂无',
    request.reason ? `原因：${request.reason}` : ''
  ].filter(Boolean).join('\n')
}

async function reviewApprovalQueue() {
  const approvals = await requestBackend<Approval[]>('approval.list')
  if (!approvals.length) {
    pendingApprovalCount = 0
    refreshTrayMenu()
    await dialog.showMessageBox({ type: 'info', message: '暂无AI 自动回复审批' })
    return
  }

  let index = 0
  while (index < approvals.length) {
    const request = approvals[index]
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'AI 自动回复审批',
      message: '是否允许 AI 自动回复这条 HR 消息？',
      detail: formatApprovalDetail(request, index, approvals.length),
      buttons: ['允许 AI 自动回复', '转人工处理', '跳过', '关闭'],
      defaultId: 2,
      cancelId: 3
    })

    if (result.response === 0) {
      await requestBackend('approval.approve', { id: request.id })
      approvals.splice(index, 1)
      continue
    }
    if (result.response === 1) {
      await requestBackend('approval.requireHuman', { id: request.id, reason: 'AI auto reply was not approved; manual handling required' })
      approvals.splice(index, 1)
      continue
    }
    if (result.response === 2) {
      index += 1
      continue
    }
    break
  }
  await syncApprovalQueueState()
}

function subscribeBackendEvents() {
  backendEvents.on('event', (event: { event?: string; data?: Record<string, unknown> }) => {
    const data = event.data ?? {}
    if (event.event === 'system.status') {
      syncBossWorkerState((data.workers as Array<{ workerId?: string }>) ?? [])
      return
    }

    if (event.event === 'approval.required') {
      void syncApprovalQueueState().catch(showTrayError)
      return
    }

    if (data.workerId !== BOSS_WORKER_ID) {
      return
    }

    if (event.event === 'task.exited') {
      isBossRunning = Boolean(data.restarting)
      isBossStopping = false
      refreshTrayMenu()
    }
  })
}

async function startBossAgent() {
  const { isAlreadyRunning } = await runCommon({ mode: BOSS_WORKER_ID, headless: isHeadlessEnabled })
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
  await requestBackend('task.stop', { workerId: BOSS_WORKER_ID })
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
        label: `AI 自动回复审批 (${pendingApprovalCount})`,
        enabled: pendingApprovalCount > 0,
        click: () => void reviewApprovalQueue().catch(showTrayError)
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
  subscribeBackendEvents()
  refreshTrayMenu()
  void syncBossWorkerStateFromDaemon().catch(showTrayError)
  void syncApprovalQueueState().catch(showTrayError)

  tray.on('click', () => showMainWindow())
  return tray
}
