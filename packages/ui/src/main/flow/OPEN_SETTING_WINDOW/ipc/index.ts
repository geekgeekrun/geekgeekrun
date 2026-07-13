import { ipcMain, app } from 'electron'
import { getAnyAvailablePuppeteerExecutable } from '../../DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable/index'
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
import { daemonEE, sendToDaemon } from '../connect-to-daemon'
import { runCommon } from '../../../features/run-common'
import { loginWithCookieAssistant } from '../../../features/login-with-cookie-assistant'
import { configWithBrowserAssistant } from '../../../features/config-with-browser-assistant'
import {
  createFirstLaunchNoticeApproveFlag,
  isFirstLaunchNoticeApproveFlagExist,
  waitForUserApproveAgreement
} from '../../../features/first-launch-notice-window'
import { getLastUsedAndAvailableBrowser } from '../../DOWNLOAD_DEPENDENCIES/utils/browser-history'
import { waitForCommonJobConditionDone } from '../../../features/common-job-condition'
import { readBackendConfig, writeBackendConfig } from '../../../backend/register-ipc'
// @ts-expect-error Backend ESM compatibility module is intentionally consumed directly by the legacy UI.
import { createBrowserCompatibilityApi } from '../../../../../ggr-backend/lib/services/browser/compat.mjs'

const WORKER_STOP_TIMEOUT_MS = 15000
const BOSS_CHILD_READY_TIMEOUT_MS = 15000
const workerExitHandlerByMode = new Map<string, (message: any) => void>()

function subscribeToWorkerExit(mode: string) {
  if (workerExitHandlerByMode.has(mode)) {
    return
  }
  const handler = (message: any) => {
    if (message.workerId !== mode || message.type !== 'worker-exited') {
      return
    }
    mainWindow?.webContents.send('worker-exited', message)
    if (!message.restarting) {
      daemonEE.off('message', handler)
      workerExitHandlerByMode.delete(mode)
    }
  }
  workerExitHandlerByMode.set(mode, handler)
  daemonEE.on('message', handler)
}

function waitForWorkerExit(workerId: string) {
  let handler: (message: any) => void
  let timeout: ReturnType<typeof setTimeout>
  const cleanup = () => {
    daemonEE.off('message', handler)
    clearTimeout(timeout)
  }
  const promise = new Promise<void>((resolve, reject) => {
    handler = (message: any) => {
      if (message.workerId === workerId && message.type === 'worker-exited') {
        cleanup()
        resolve()
      }
    }
    daemonEE.on('message', handler)
    timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for worker to exit: ${workerId}`))
    }, WORKER_STOP_TIMEOUT_MS)
  })
  return { promise, cleanup }
}

async function stopWorkerAndNotify({ workerId, stoppingEvent, stoppedEvent }) {
  mainWindow?.webContents.send(stoppingEvent)
  const waitForExit = waitForWorkerExit(workerId)
  try {
    await sendToDaemon(
      {
        type: 'stop-worker',
        workerId
      },
      {
        needCallback: true
      }
    )
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
    const result = await sendToDaemon(
      {
        type: 'get-status'
      },
      {
        needCallback: true
      }
    )
    return result
  })

  // IPC处理：停止工具进程
  ipcMain.handle('stop-task', async (_, workerId) => {
    await sendToDaemon(
      {
        type: 'stop-worker',
        workerId
      },
      {
        needCallback: true
      }
    )
  })

  let bossBridge: ReturnType<typeof createBrowserCompatibilityApi> | null = null
  let bossBridgeReady: Promise<void> | null = null
  ipcMain.handle('open-site-with-boss-cookie', async (_ev, data) => {
    const url = data.url
    if (!bossBridgeReady || !bossBridge) {
      const ready = Promise.withResolvers<void>()
      let bossChildReady = false
      let readyTimeout: ReturnType<typeof setTimeout>
      const failBossStartup = async (error: Error) => {
        if (bossChildReady) return
        bossChildReady = true
        clearTimeout(readyTimeout)
        ready.reject(error)
        const current = bossBridge
        bossBridge = null
        bossBridgeReady = null
        await current?.close().catch(() => {})
      }
      bossBridge = createBrowserCompatibilityApi({
        onMessage: (message) => {
          switch (message?.type) {
            case 'SUB_PROCESS_OF_OPEN_BOSS_SITE_READY':
              bossChildReady = true
              clearTimeout(readyTimeout)
              ready.resolve()
              break
            case 'SUB_PROCESS_OF_OPEN_BOSS_SITE_FAILED':
              void failBossStartup(new Error(message.message ?? message.code ?? 'Boss browser bridge failed'))
              break
            case 'SUB_PROCESS_OF_OPEN_BOSS_SITE_CAN_BE_KILLED': {
              const current = bossBridge
              bossBridge = null
              bossBridgeReady = null
              void current?.close().catch(() => {})
              break
            }
          }
        }
      })
      readyTimeout = setTimeout(() => {
        void failBossStartup(new Error('Timed out waiting for Boss browser bridge readiness'))
      }, BOSS_CHILD_READY_TIMEOUT_MS)
      bossBridgeReady = ready.promise
      bossBridge.startBoss()
    }

    await bossBridgeReady
    await bossBridge?.openBossPage(url ?? 'about:blank')
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
    const puppeteerExecutable = await getAnyAvailablePuppeteerExecutable()
    if (!puppeteerExecutable) {
      const lastBrowser = await getLastUsedAndAvailableBrowser()
      if (!lastBrowser) {
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
