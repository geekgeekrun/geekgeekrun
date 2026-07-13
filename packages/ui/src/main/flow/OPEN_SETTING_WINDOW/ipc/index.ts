import { ipcMain, app } from 'electron'
import { mainWindow } from '../../../window/mainWindow'
import { createLlmConfigWindow, llmConfigWindow } from '../../../window/llmConfigWindow'
import { createResumeEditorWindow, resumeEditorWindow } from '../../../window/resumeEditorWindow'
import { requestNewMessageContent } from '../../READ_NO_REPLY_AUTO_REMINDER_MAIN/boss-operation'
import {
  checkIsResumeContentValid,
  resumeContentEnoughDetect
} from '../../../../common/utils/resume'
import {
  createReadNoReplyReminderLlmMockWindow,
  readNoReplyReminderLlmMockWindow
} from '../../../window/readNoReplyReminderLlmMockWindow'
import { RequestSceneEnum } from '../../../features/llm-request-log'
import { checkUpdateForUi } from '../../../features/updater'
import gtag from '../../../utils/gtag'
import { runCommon } from '../../../features/run-common'
import { loginWithCookieAssistant } from '../../../features/login-with-cookie-assistant'
import { configWithBrowserAssistant } from '../../../features/config-with-browser-assistant'
import {
  createFirstLaunchNoticeApproveFlag,
  isFirstLaunchNoticeApproveFlagExist,
  waitForUserApproveAgreement
} from '../../../features/first-launch-notice-window'
import { waitForCommonJobConditionDone } from '../../../features/common-job-condition'
import { readBackendConfig, writeBackendConfig } from '../../../backend/register-ipc'
import { requestBackend } from '../../../backend/client'
import { backendEvents } from '../../../backend/events'

const WORKER_STOP_TIMEOUT_MS = 15000
const BOSS_BROWSER_READY_TIMEOUT_MS = 15000
const workerExitHandlerByMode = new Map<string, (event: any) => void>()

function subscribeToWorkerExit(mode: string) {
  if (workerExitHandlerByMode.has(mode)) {
    return
  }
  const handler = (event: any) => {
    if (event.event !== 'task.exited' || event.data?.workerId !== mode) {
      return
    }
    mainWindow?.webContents.send('worker-exited', event.data)
    if (!event.data.restarting) {
      backendEvents.off('event', handler)
      workerExitHandlerByMode.delete(mode)
    }
  }
  workerExitHandlerByMode.set(mode, handler)
  backendEvents.on('event', handler)
}

function waitForWorkerExit(workerId: string) {
  let handler: (event: any) => void
  let timeout: ReturnType<typeof setTimeout>
  const cleanup = () => {
    backendEvents.off('event', handler)
    clearTimeout(timeout)
  }
  const promise = new Promise<void>((resolve, reject) => {
    handler = (event: any) => {
      if (event.event === 'task.exited' && event.data?.workerId === workerId) {
        cleanup()
        resolve()
      }
    }
    backendEvents.on('event', handler)
    timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for worker to exit: ${workerId}`))
    }, WORKER_STOP_TIMEOUT_MS)
  })
  return { promise, cleanup }
}

function waitForBrowserReady(taskId: string) {
  let timeout: ReturnType<typeof setTimeout>
  let handler: (event: any) => void
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const cleanup = () => {
      backendEvents.off('event', handler)
      clearTimeout(timeout)
    }
    handler = (event: any) => {
      const data = event.data as Record<string, unknown> | undefined
      if (event.event !== 'task.progress' || data?.taskId !== taskId) return
      if (data.state === 'page-opened') {
        cleanup()
        resolve(data)
      } else if (data.state === 'failed' || data.state === 'cancelled') {
        cleanup()
        reject(new Error(String(data.message ?? 'Boss browser failed to start')))
      }
    }
    backendEvents.on('event', handler)
    timeout = setTimeout(() => {
      cleanup()
      void requestBackend('browser.cancel', { taskId }).catch(() => {})
      reject(new Error('Timed out waiting for Boss browser readiness'))
    }, BOSS_BROWSER_READY_TIMEOUT_MS)
  })
}

async function stopWorkerAndNotify({ workerId, stoppingEvent, stoppedEvent }) {
  mainWindow?.webContents.send(stoppingEvent)
  const workers = await requestBackend<Array<{ workerId?: string }>>('task.list')
  if (!workers.some((worker) => worker.workerId === workerId)) {
    mainWindow?.webContents.send(stoppedEvent)
    return
  }
  const waitForExit = waitForWorkerExit(workerId)
  try {
    await requestBackend('task.stop', { workerId })
    await waitForExit.promise
    mainWindow?.webContents.send(stoppedEvent)
  } finally {
    waitForExit.cleanup()
  }
}

export default function initIpc() {
  ipcMain.handle('run-geek-auto-start-chat-with-boss', async () => {
    const mode = 'geekAutoStartWithBossMain'
    const { runRecordId } = await runCommon({ mode })
    subscribeToWorkerExit(mode)
    return { runRecordId }
  })

  ipcMain.handle('run-read-no-reply-auto-reminder', async () => {
    const mode = 'readNoReplyAutoReminderMain'
    const { runRecordId } = await runCommon({ mode })
    subscribeToWorkerExit(mode)
    return { runRecordId }
  })

  ipcMain.handle('stop-geek-auto-start-chat-with-boss', async () => {
    await stopWorkerAndNotify({
      workerId: 'geekAutoStartWithBossMain',
      stoppingEvent: 'geek-auto-start-chat-with-boss-stopping',
      stoppedEvent: 'geek-auto-start-chat-with-boss-stopped'
    })
  })

  ipcMain.handle('stop-read-no-reply-auto-reminder', async () => {
    await stopWorkerAndNotify({
      workerId: 'readNoReplyAutoReminderMain',
      stoppingEvent: 'read-no-reply-auto-reminder-stopping',
      stoppedEvent: 'read-no-reply-auto-reminder-stopped'
    })
  })

  ipcMain.handle('get-task-manager-list', async () => {
    return { workers: await requestBackend('task.list') }
  })

  // IPC处理：停止工具进程
  ipcMain.handle('stop-task', async (_, workerId) => {
    await requestBackend('task.stop', { workerId })
  })

  ipcMain.handle('open-site-with-boss-cookie', async (_ev, data) => {
    const url = typeof data?.url === 'string' ? data.url : undefined
    const task = await requestBackend<{ taskId: string }>('browser.openBoss', { url })
    const ready = await waitForBrowserReady(task.taskId)
    return { taskId: task.taskId, state: 'ready', url: ready.url ?? url }
  })

  ipcMain.handle('llm-config', async () => {
    createLlmConfigWindow({
      parent: mainWindow!,
      modal: true,
      show: true
    })
    const defer = Promise.withResolvers<void>()
    async function saveLlmConfigHandler(_, configToSave) {
      await writeBackendConfig('llm_config', configToSave)
      defer.resolve()
      ipcMain.removeHandler('save-llm-config')
      llmConfigWindow?.close()
    }
    ipcMain.handle('save-llm-config', saveLlmConfigHandler)
    llmConfigWindow?.once('closed', () => {
      ipcMain.removeHandler('save-llm-config')
      defer.reject(new Error('cancel'))
    })
    return defer.promise
  })
  ipcMain.on('close-llm-config', () => llmConfigWindow?.close())

  ipcMain.handle('resume-edit', async () => {
    createResumeEditorWindow({
      parent: mainWindow!,
      modal: true,
      show: true
    })
    const defer = Promise.withResolvers<void>()
    async function saveResumeHandler(_, resumeContent) {
      await writeBackendConfig('resumes', [
        {
          name: '默认简历',
          updateTime: Number(new Date()),
          content: resumeContent
        }
      ])
      defer.resolve()
      resumeEditorWindow?.close()
    }
    ipcMain.handle('save-resume-content', saveResumeHandler)
    resumeEditorWindow?.once('closed', () => {
      ipcMain.removeHandler('save-resume-content')
      defer.reject(new Error('cancel'))
    })

    return defer.promise
  })
  ipcMain.handle('fetch-resume-content', async () => {
    const res = (await readBackendConfig<Array<{ content?: unknown }>>('resumes'))?.[0]
    return res?.content ?? null
  })
  ipcMain.on('no-reply-reminder-prompt-edit', async (_, { type }) => {
    const resource = type === 'open' ? 'auto_reminder_open_template' : 'auto_reminder_rechat_template'
    mainWindow?.webContents.send('auto-reminder-prompt-content', {
      type,
      content: await readBackendConfig(resource)
    })
  })
  ipcMain.on('close-resume-editor', () => resumeEditorWindow?.close())
  ipcMain.handle('check-if-auto-remind-prompt-valid', async (_, { type }) => {
    const resource = type === 'open' ? 'auto_reminder_open_template' : 'auto_reminder_rechat_template'
    const content = await readBackendConfig<string>(resource)
    if (type === 'rechat' && !content.includes('__REPLACE_REAL_RESUME_HERE__')) {
      throw Object.assign(new Error('简历内容占位符字符串不存在。'), { name: 'RESUME_PLACEHOLDER_NOT_EXIST' })
    }
  })
  ipcMain.handle('check-is-resume-content-valid', async () => {
    const res = (await readBackendConfig('resumes') as any[])?.[0]
    return checkIsResumeContentValid(res)
  })
  ipcMain.handle('resume-content-enough-detect', async () => {
    const res = (await readBackendConfig('resumes') as any[])?.[0]
    return resumeContentEnoughDetect(res)
  })
  ipcMain.handle('overwrite-auto-remind-prompt-with-default', async (_, { type }) => {
    const resource = type === 'open' ? 'auto_reminder_open_template' : 'auto_reminder_rechat_template'
    const defaultResource = type === 'open'
      ? 'auto_reminder_open_template_default'
      : 'auto_reminder_rechat_template_default'
    const content = await readBackendConfig<string>(defaultResource)
    await writeBackendConfig(resource, content)
  })
  ipcMain.handle('check-if-llm-config-list-valid', async () => {
    const llmConfigList = await readBackendConfig<any[]>('llm_config')
    if (!Array.isArray(llmConfigList) || !llmConfigList?.length) {
      throw new Error('CANNOT_FIND_VALID_CONFIG')
    }
    if (llmConfigList.some((it) => !/^http(s)?:\/\//.test(it.providerCompleteApiUrl))) {
      throw new Error('CANNOT_FIND_VALID_CONFIG')
    }
    if (llmConfigList.length > 1) {
      const firstEnabledModel = llmConfigList.find((it) => it.enabled)
      if (!firstEnabledModel) {
        throw new Error('CANNOT_FIND_VALID_CONFIG')
      }
    }
  })
  ipcMain.on('test-llm-config-effect', (_, { autoReminderConfig } = {}) => {
    createReadNoReplyReminderLlmMockWindow(
      {
        parent: mainWindow!,
        modal: true,
        show: true
      },
      {
        autoReminderConfig
      }
    )
    async function requestLlm(_, requestPayload) {
      return await requestNewMessageContent(requestPayload.messageList, {
        requestScene: RequestSceneEnum.testing,
        llmConfigIdForPick: requestPayload.llmConfigIdForPick ?? null
      })
    }
    ipcMain.handle('request-llm-for-test', requestLlm)
    readNoReplyReminderLlmMockWindow?.once('closed', () => {
      ipcMain.removeHandler('request-llm-for-test')
    })
    async function getLlmConfigList() {
      return await readBackendConfig('llm_config')
    }
    ipcMain.handle('get-llm-config-for-test', getLlmConfigList)
    readNoReplyReminderLlmMockWindow?.once('closed', () => {
      ipcMain.removeHandler('get-llm-config-for-test')
    })
  })
  ipcMain.on('close-read-no-reply-reminder-llm-mock-window', () => {
    readNoReplyReminderLlmMockWindow?.close()
    gtag('mock_chat_window_closed')
  })
  ipcMain.handle('check-update', async () => {
    const newRelease = await checkUpdateForUi()
    return newRelease
  })
  ipcMain.handle('login-with-cookie-assistant', async () => {
    return await loginWithCookieAssistant({
      windowOption: {
        parent: mainWindow!,
        modal: true,
        show: true
      }
    })
  })
  ipcMain.handle('config-with-browser-assistant', async () => {
    return await configWithBrowserAssistant({
      windowOption: {
        parent: mainWindow!,
        modal: true,
        show: true
      }
    })
  })

  ipcMain.handle('pre-enter-setting-ui', async () => {
    if (!isFirstLaunchNoticeApproveFlagExist()) {
      try {
        await waitForUserApproveAgreement({
          windowOption: {
            parent: mainWindow!,
            modal: true,
            show: true
          }
        })
        createFirstLaunchNoticeApproveFlag()
      } catch {
        app.exit(0)
        return
      }
    }
    const puppeteerExecutable = await requestBackend('browser.getAvailable')
    if (!puppeteerExecutable) {
      try {
        await configWithBrowserAssistant({
          windowOption: {
            parent: mainWindow!,
            modal: true,
            show: true
          },
          autoFind: true
        })
      } catch (err) {
        void err
      }
    }
  })
  ipcMain.handle('common-job-condition-config', async () => {
    await waitForCommonJobConditionDone()
    mainWindow?.webContents.send('common-job-condition-config-updated', {
      config: await readBackendConfig('job_intention')
    })
  })

  ipcMain.handle('exit-app-immediately', () => {
    app.exit(0)
  })
}
