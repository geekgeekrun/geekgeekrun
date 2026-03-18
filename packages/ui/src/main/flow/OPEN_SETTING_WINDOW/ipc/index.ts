import { ipcMain, shell, app, dialog, BrowserWindow } from 'electron'
import path from 'path'
import * as childProcess from 'node:child_process'
import {
  readConfigFile,
  writeConfigFile,
  readStorageFile,
  storageFilePath
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

import { ChildProcess } from 'child_process'
import * as JSONStream from 'JSONStream'
import { checkCookieListFormat } from '../../../../common/utils/cookie'
import { getAnyAvailablePuppeteerExecutable } from '../../DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable/index'
import { mainWindow } from '../../../window/mainWindow'
import {
  getAutoStartChatRecord,
  getBossLibrary,
  getCompanyLibrary,
  getJobLibrary,
  getJobHistoryByEncryptId,
  getMarkAsNotSuitRecord
} from '../utils/db/index'
import { PageReq } from '../../../../common/types/pagination'
import { pipeWriteRegardlessError } from '../../utils/pipe'
import { WriteStream } from 'node:fs'
// eslint-disable-next-line vue/prefer-import-from-vue
import { hasOwn } from '@vue/shared'
import { createLlmConfigWindow, llmConfigWindow } from '../../../window/llmConfigWindow'
import { createResumeEditorWindow, resumeEditorWindow } from '../../../window/resumeEditorWindow'
import {
  getValidTemplate,
  requestNewMessageContent
} from '../../READ_NO_REPLY_AUTO_REMINDER_MAIN/boss-operation'
import {
  defaultPromptMap,
  writeDefaultAutoRemindPrompt
} from '../../READ_NO_REPLY_AUTO_REMINDER_MAIN/boss-operation'
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
import { ensureConfigFileExist } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

export default function initIpc() {
  ipcMain.handle('save-config-file-from-ui', async (ev, payload) => {
    payload = JSON.parse(payload)
    ensureConfigFileExist()

    const promiseArr: Array<Promise<unknown>> = []

    const dingtalkConfig = readConfigFile('dingtalk.json')
    if (hasOwn(payload, 'dingtalkRobotAccessToken')) {
      dingtalkConfig.groupRobotAccessToken = payload.dingtalkRobotAccessToken
    }
    promiseArr.push(writeConfigFile('dingtalk.json', dingtalkConfig))

    const bossConfig = readConfigFile('boss.json')
    if (hasOwn(payload, 'anyCombineRecommendJobFilter')) {
      bossConfig.anyCombineRecommendJobFilter = payload.anyCombineRecommendJobFilter
    }
    delete bossConfig.expectJobRegExpStr
    if (hasOwn(payload, 'expectJobNameRegExpStr')) {
      bossConfig.expectJobNameRegExpStr = payload.expectJobNameRegExpStr
    }
    if (hasOwn(payload, 'expectJobTypeRegExpStr')) {
      bossConfig.expectJobTypeRegExpStr = payload.expectJobTypeRegExpStr
    }
    if (hasOwn(payload, 'expectJobDescRegExpStr')) {
      bossConfig.expectJobDescRegExpStr = payload.expectJobDescRegExpStr
    }
    if (hasOwn(payload, 'jobNotMatchStrategy')) {
      bossConfig.jobNotMatchStrategy = payload.jobNotMatchStrategy
    }
    if (hasOwn(payload, 'markAsNotActiveSelectedTimeRange')) {
      bossConfig.markAsNotActiveSelectedTimeRange = payload.markAsNotActiveSelectedTimeRange
    }
    if (hasOwn(payload, 'jobNotActiveStrategy')) {
      bossConfig.jobNotActiveStrategy = payload.jobNotActiveStrategy
    }
    if (hasOwn(payload, 'autoReminder')) {
      bossConfig.autoReminder = payload.autoReminder
    }

    // city
    if (hasOwn(payload, 'expectCityList')) {
      bossConfig.expectCityList = payload.expectCityList
    }
    if (hasOwn(payload, 'expectCityNotMatchStrategy')) {
      bossConfig.expectCityNotMatchStrategy = payload.expectCityNotMatchStrategy
    }
    if (hasOwn(payload, 'strategyScopeOptionWhenMarkJobCityNotMatch')) {
      bossConfig.strategyScopeOptionWhenMarkJobCityNotMatch =
        payload.strategyScopeOptionWhenMarkJobCityNotMatch
    }

    // salary
    if (hasOwn(payload, 'expectSalaryCalculateWay')) {
      bossConfig.expectSalaryCalculateWay = payload.expectSalaryCalculateWay
    }
    if (hasOwn(payload, 'expectSalaryNotMatchStrategy')) {
      bossConfig.expectSalaryNotMatchStrategy = payload.expectSalaryNotMatchStrategy
    }
    if (hasOwn(payload, 'strategyScopeOptionWhenMarkSalaryNotMatch')) {
      bossConfig.strategyScopeOptionWhenMarkSalaryNotMatch =
        payload.strategyScopeOptionWhenMarkSalaryNotMatch
    }
    if (hasOwn(payload, 'expectSalaryLow')) {
      bossConfig.expectSalaryLow = payload.expectSalaryLow
    }
    if (hasOwn(payload, 'expectSalaryHigh')) {
      bossConfig.expectSalaryHigh = payload.expectSalaryHigh
    }

    // work exp
    if (hasOwn(payload, 'expectWorkExpList')) {
      bossConfig.expectWorkExpList = payload.expectWorkExpList
    }
    if (hasOwn(payload, 'expectWorkExpNotMatchStrategy')) {
      bossConfig.expectWorkExpNotMatchStrategy = payload.expectWorkExpNotMatchStrategy
    }
    if (hasOwn(payload, 'strategyScopeOptionWhenMarkJobWorkExpNotMatch')) {
      bossConfig.strategyScopeOptionWhenMarkJobWorkExpNotMatch =
        payload.strategyScopeOptionWhenMarkJobWorkExpNotMatch
    }
    if (hasOwn(payload, 'jobDetailRegExpMatchLogic')) {
      bossConfig.jobDetailRegExpMatchLogic = payload.jobDetailRegExpMatchLogic
    }
    if (hasOwn(payload, 'isSkipEmptyConditionForCombineRecommendJobFilter')) {
      bossConfig.isSkipEmptyConditionForCombineRecommendJobFilter =
        payload.isSkipEmptyConditionForCombineRecommendJobFilter
    }
    if (hasOwn(payload, 'jobSourceList')) {
      bossConfig.jobSourceList = payload.jobSourceList
    }
    if (hasOwn(payload, 'combineRecommendJobFilterType')) {
      bossConfig.combineRecommendJobFilterType = payload.combineRecommendJobFilterType
    }
    if (hasOwn(payload, 'staticCombineRecommendJobFilterConditions')) {
      bossConfig.staticCombineRecommendJobFilterConditions =
        payload.staticCombineRecommendJobFilterConditions
    }
    if (hasOwn(payload, 'isSageTimeEnabled')) {
      bossConfig.isSageTimeEnabled = payload.isSageTimeEnabled
    }
    if (hasOwn(payload, 'sageTimeOpTimes')) {
      bossConfig.sageTimeOpTimes = payload.sageTimeOpTimes
    }
    if (hasOwn(payload, 'sageTimePauseMinute')) {
      bossConfig.sageTimePauseMinute = payload.sageTimePauseMinute
    }
    if (hasOwn(payload, 'blockCompanyNameRegExpStr')) {
      bossConfig.blockCompanyNameRegExpStr = payload.blockCompanyNameRegExpStr
    }
    if (hasOwn(payload, 'blockCompanyNameRegMatchStrategy')) {
      bossConfig.blockCompanyNameRegMatchStrategy = payload.blockCompanyNameRegMatchStrategy
    }
    if (hasOwn(payload, 'fieldsForUseCommonConfig')) {
      bossConfig.fieldsForUseCommonConfig = payload.fieldsForUseCommonConfig
    }

    promiseArr.push(writeConfigFile('boss.json', bossConfig))

    if (hasOwn(payload, 'expectCompanies')) {
      promiseArr.push(
        writeConfigFile('target-company-list.json', payload.expectCompanies?.split(',') ?? [])
      )
    }

    return await Promise.all(promiseArr)
  })

  ipcMain.handle('run-geek-auto-start-chat-with-boss', async (ev) => {
    const mode = 'geekAutoStartWithBossMain'
    const { runRecordId } = await runCommon({ mode })
    daemonEE.on('message', function handler(message) {
      if (message.workerId !== mode) {
        return
      }
      if (message.type === 'worker-exited') {
        mainWindow?.webContents.send('worker-exited', message)
      }
    })
    return { runRecordId }
  })

  ipcMain.handle('run-read-no-reply-auto-reminder', async () => {
    const mode = 'readNoReplyAutoReminderMain'
    const { runRecordId } = await runCommon({ mode })
    daemonEE.on('message', function handler(message) {
      if (message.workerId !== mode) {
        return
      }
      if (message.type === 'worker-exited') {
        mainWindow?.webContents.send('worker-exited', message)
      }
    })
    return { runRecordId }
  })

  ipcMain.handle('stop-geek-auto-start-chat-with-boss', async () => {
    mainWindow?.webContents.send('geek-auto-start-chat-with-boss-stopping')
    const p = new Promise((resolve) => {
      daemonEE.on('message', function handler(message) {
        if (message.workerId !== 'geekAutoStartWithBossMain') {
          return
        }
        if (message.type === 'worker-exited') {
          daemonEE.off('message', handler)
          resolve(undefined)
        }
      })
    })
    await sendToDaemon(
      {
        type: 'stop-worker',
        workerId: 'geekAutoStartWithBossMain'
      },
      {
        needCallback: true
      }
    )

    await p
    mainWindow?.webContents.send('geek-auto-start-chat-with-boss-stopped')
  })

  ipcMain.handle('stop-read-no-reply-auto-reminder', async () => {
    mainWindow?.webContents.send('read-no-reply-auto-reminder-stopping')
    const p = new Promise((resolve) => {
      daemonEE.on('message', function handler(message) {
        if (message.workerId !== 'readNoReplyAutoReminderMain') {
          return
        }
        if (message.type === 'worker-exited') {
          daemonEE.off('message', handler)
          resolve(undefined)
        }
      })
    })
    await sendToDaemon(
      {
        type: 'stop-worker',
        workerId: 'readNoReplyAutoReminderMain'
      },
      {
        needCallback: true
      }
    )

    await p
    mainWindow?.webContents.send('read-no-reply-auto-reminder-stopped')
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

  ipcMain.handle('check-boss-zhipin-cookie-file', () => {
    const cookies = readStorageFile('boss-cookies.json')
    return checkCookieListFormat(cookies)
  })

  ipcMain.handle('get-auto-start-chat-record', async (ev, payload: PageReq) => {
    const a = await getAutoStartChatRecord(payload)
    return a
  })
  ipcMain.handle('get-mark-as-not-suit-record', async (ev, payload: PageReq) => {
    const a = await getMarkAsNotSuitRecord(payload)
    return a
  })
  ipcMain.handle('get-job-library', async (ev, payload: PageReq) => {
    const a = await getJobLibrary(payload)
    return a
  })
  ipcMain.handle('get-boss-library', async (ev, payload: PageReq) => {
    const a = await getBossLibrary(payload)
    return a
  })
  ipcMain.handle('get-company-library', async (ev, payload: PageReq) => {
    const a = await getCompanyLibrary(payload)
    return a
  })

  let subProcessOfOpenBossSiteDefer: null | PromiseWithResolvers<ChildProcess> = null
  let subProcessOfOpenBossSite: null | ChildProcess = null
  ipcMain.handle('open-site-with-boss-cookie', async (ev, data) => {
    const url = data.url
    if (
      !subProcessOfOpenBossSiteDefer ||
      !subProcessOfOpenBossSite ||
      subProcessOfOpenBossSite.killed
    ) {
      subProcessOfOpenBossSiteDefer = Promise.withResolvers()
      let puppeteerExecutable = await getLastUsedAndAvailableBrowser()
      if (!puppeteerExecutable) {
        try {
          const parent = BrowserWindow.fromWebContents(ev.sender) || undefined
          await configWithBrowserAssistant({
            autoFind: true,
            windowOption: {
              parent,
              modal: !!parent,
              show: true
            }
          })
          puppeteerExecutable = await getLastUsedAndAvailableBrowser()
        } catch (error) {
          //
        }
      }
      if (!puppeteerExecutable) {
        await dialog.showMessageBox({
          type: `error`,
          message: `未找到可用的浏览器`,
          detail: `请重新运行本程序，按照提示安装、配置浏览器`
        })
        return
      }
      const subProcessEnv = {
        ...process.env,
        PUPPETEER_EXECUTABLE_PATH: puppeteerExecutable!.executablePath
      }
      subProcessOfOpenBossSite = childProcess.spawn(
        process.argv[0],
        process.env.NODE_ENV === 'development'
          ? [process.argv[1], `--mode=launchBossSite`]
          : [`--mode=launchBossSite`],
        {
          env: subProcessEnv,
          stdio: ['inherit', 'inherit', 'inherit', 'pipe']
        }
      )
      subProcessOfOpenBossSite.once('exit', () => {
        subProcessOfOpenBossSiteDefer = null
      })
      subProcessOfOpenBossSite.stdio[3]!.pipe(JSONStream.parse()).on(
        'data',
        async function handler(data) {
          switch (data?.type) {
            case 'SUB_PROCESS_OF_OPEN_BOSS_SITE_READY': {
              subProcessOfOpenBossSiteDefer!.resolve(subProcessOfOpenBossSite as ChildProcess)
              break
            }
            case 'SUB_PROCESS_OF_OPEN_BOSS_SITE_CAN_BE_KILLED': {
              try {
                subProcessOfOpenBossSite &&
                  !subProcessOfOpenBossSite.killed &&
                  subProcessOfOpenBossSite.pid &&
                  process.kill(subProcessOfOpenBossSite.pid)
              } catch {
                //
              } finally {
                subProcessOfOpenBossSiteDefer = null
                subProcessOfOpenBossSite = null
              }
              break
            }
          }
        }
      )
    }

    await subProcessOfOpenBossSiteDefer.promise

    pipeWriteRegardlessError(
      subProcessOfOpenBossSite!.stdio[3]! as WriteStream,
      JSON.stringify({
        type: 'NEW_WINDOW',
        url: url ?? 'about:blank'
      })
    )
  })

  ipcMain.handle('get-job-history-by-encrypt-id', async (_, encryptJobId) => {
    return await getJobHistoryByEncryptId(encryptJobId)
  })

  ipcMain.handle('llm-config', async () => {
    createLlmConfigWindow({
      parent: mainWindow!,
      modal: true,
      show: true
    })
    const defer = Promise.withResolvers<void>()
    async function saveLlmConfigHandler(_, configToSave) {
      await writeConfigFile('llm.json', configToSave)
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

  // ── 招聘端 LLM 配置 (boss-llm.json) ─────────────────────────────────────────
  ipcMain.handle('boss-fetch-llm-config', async () => {
    const { readBossLlmConfig } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    return readBossLlmConfig()
  })

  ipcMain.handle('boss-save-llm-config', async (_, payload) => {
    const { writeBossLlmConfig } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    const config = typeof payload === 'string' ? JSON.parse(payload) : payload
    return await writeBossLlmConfig(config)
  })

  ipcMain.handle('boss-test-llm-endpoint', async (_, model: {
    baseURL: string
    apiKey: string
  }) => {
    try {
      // 使用 GET /models 验证 baseURL + apiKey 的连通性，不消耗任何 token
      const { net } = await import('electron')
      const url = model.baseURL.replace(/\/$/, '') + '/models'
      const res = await net.fetch(url, {
        headers: { Authorization: `Bearer ${model.apiKey}` }
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { ok: false, error: `${res.status} ${res.statusText}${body ? ': ' + body.slice(0, 200) : ''}` }
      }
      return { ok: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })
  // ── end 招聘端 LLM 配置窗口 ──────────────────────────────────────────────────

  ipcMain.handle('resume-edit', async () => {
    createResumeEditorWindow({
      parent: mainWindow!,
      modal: true,
      show: true
    })
    const defer = Promise.withResolvers<void>()
    async function saveResumeHandler(_, resumeContent) {
      await writeConfigFile('resumes.json', [
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
    const res = (await readConfigFile('resumes.json'))?.[0]
    return res?.content ?? null
  })
  ipcMain.on('no-reply-reminder-prompt-edit', async (_, { type }) => {
    const template = await readStorageFile(defaultPromptMap[type].fileName, {
      isJson: false
    })
    if (!template) {
      await writeDefaultAutoRemindPrompt({ type })
    }
    const filePath = path.join(storageFilePath, defaultPromptMap[type].fileName)
    shell.openPath(filePath)
  })
  ipcMain.on('close-resume-editor', () => resumeEditorWindow?.close())
  ipcMain.handle('check-if-auto-remind-prompt-valid', async (_, { type }) => {
    await getValidTemplate({ type })
  })
  ipcMain.handle('check-is-resume-content-valid', async () => {
    const res = (await readConfigFile('resumes.json'))?.[0]
    return checkIsResumeContentValid(res)
  })
  ipcMain.handle('resume-content-enough-detect', async () => {
    const res = (await readConfigFile('resumes.json'))?.[0]
    return resumeContentEnoughDetect(res)
  })
  ipcMain.handle('overwrite-auto-remind-prompt-with-default', async (_, { type }) => {
    await writeDefaultAutoRemindPrompt({ type })
  })
  ipcMain.handle('check-if-llm-config-list-valid', async () => {
    const llmConfigList = await readConfigFile('llm.json')
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
      return await readConfigFile('llm.json')
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
      config: await readConfigFile('common-job-condition-config.json')
    })
  })

  ipcMain.handle('exit-app-immediately', () => {
    app.exit(0)
  })

  ipcMain.handle('fetch-webhook-config', async () => {
    const { readConfigFile: readBossConfigFile } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    return readBossConfigFile('webhook.json') ?? null
  })

  ipcMain.handle('save-webhook-config', async (_, payload) => {
    const { readConfigFile: readBossConfigFile, writeConfigFile: writeBossConfigFile } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    const config = JSON.parse(payload)
    const existing = readBossConfigFile('webhook.json') ?? {}
    return await writeBossConfigFile('webhook.json', { ...existing, ...config })
  })

  ipcMain.handle('test-webhook', async () => {
    const { readConfigFile: readBossConfigFile, storageFilePath } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    const config = readBossConfigFile('webhook.json')
    if (!config?.url) {
      throw new Error('未配置 Webhook URL')
    }
    const { sendWebhook, buildMockPayload } = await import('../../../features/webhook/index')
    const result = await sendWebhook(config, buildMockPayload(), {
      storageDir: storageFilePath
    })
    console.log(`[webhook] 保存并测试发送完成，HTTP ${result.status}`)
    return result
  })

  ipcMain.handle('trigger-webhook-manually', async (_, useRealData?: boolean) => {
    const { readConfigFile: readBossConfigFile, storageFilePath } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    const config = readBossConfigFile('webhook.json')
    if (!config?.url) {
      throw new Error('未配置 Webhook URL')
    }
    const pathModule = await import('node:path')
    const {
      sendWebhook,
      buildMockPayload,
      buildPayloadFromDb
    } = await import('../../../features/webhook/index')
    const dbPath = pathModule.default.join(storageFilePath, 'public.db')
    let payload =
      useRealData === true
        ? await buildPayloadFromDb(dbPath)
        : null
    if (!payload) {
      payload = buildMockPayload()
      payload.runId = `manual-${Date.now()}`
    }
    const result = await sendWebhook(config, payload, {
      storageDir: storageFilePath
    })
    console.log(
      `[webhook] 手动触发完成，runId=${payload.runId}，${useRealData ? '真实数据' : 'Mock'}，HTTP ${result.status}`
    )
    return result
  })

  ipcMain.handle('run-boss-recommend', async () => {
    const mode = 'bossRecommendMain'
    const { runRecordId } = await runCommon({ mode })
    daemonEE.on('message', function handler(message) {
      if (message.workerId !== mode) {
        return
      }
      if (message.type === 'worker-exited') {
        mainWindow?.webContents.send('worker-exited', message)
      }
    })
    return { runRecordId }
  })

  ipcMain.handle('stop-boss-recommend', async () => {
    mainWindow?.webContents.send('boss-recommend-stopping')
    const p = new Promise((resolve) => {
      daemonEE.on('message', function handler(message) {
        if (message.workerId !== 'bossRecommendMain') {
          return
        }
        if (message.type === 'worker-exited') {
          daemonEE.off('message', handler)
          resolve(undefined)
        }
      })
    })
    await sendToDaemon(
      {
        type: 'stop-worker',
        workerId: 'bossRecommendMain'
      },
      {
        needCallback: true
      }
    )
    await p
    mainWindow?.webContents.send('boss-recommend-stopped')
  })

  ipcMain.handle('run-boss-chat-page', async () => {
    const mode = 'bossChatPageMain'
    const { runRecordId } = await runCommon({ mode })
    daemonEE.on('message', function handler(message) {
      if (message.workerId !== mode) {
        return
      }
      if (message.type === 'worker-exited') {
        mainWindow?.webContents.send('worker-exited', message)
      }
    })
    return { runRecordId }
  })

  ipcMain.handle('stop-boss-chat-page', async () => {
    mainWindow?.webContents.send('boss-chat-page-stopping')
    const p = new Promise((resolve) => {
      daemonEE.on('message', function handler(message) {
        if (message.workerId !== 'bossChatPageMain') {
          return
        }
        if (message.type === 'worker-exited') {
          daemonEE.off('message', handler)
          resolve(undefined)
        }
      })
    })
    await sendToDaemon(
      {
        type: 'stop-worker',
        workerId: 'bossChatPageMain'
      },
      {
        needCallback: true
      }
    )
    await p
    mainWindow?.webContents.send('boss-chat-page-stopped')
  })

  // ── 招聘端调试工具 ──────────────────────────────────────────────────────────
  // 通过 stdio fd3 双向 JSON 通信：主进程发命令，worker 返回结果。
  let bossChatDebugProcess: ChildProcess | null = null
  let bossChatDebugReadyDefer: PromiseWithResolvers<void> | null = null
  const bossChatDebugPendingCmds = new Map<string, PromiseWithResolvers<any>>()

  const closeBossChatDebug = () => {
    if (bossChatDebugProcess && !bossChatDebugProcess.killed) {
      try {
        bossChatDebugProcess.kill('SIGTERM')
      } catch {
        // Process may already have exited (e.g. user closed browser); ignore
      }
    }
    bossChatDebugProcess = null
    bossChatDebugReadyDefer = null
  }

  ipcMain.handle('open-boss-chat-debug', async (ev) => {
    // 若 worker 已在运行，直接返回
    if (bossChatDebugProcess && !bossChatDebugProcess.killed) {
      return { ok: true, alreadyRunning: true }
    }
    let puppeteerExecutable = await getLastUsedAndAvailableBrowser()
    if (!puppeteerExecutable) {
      try {
        const parent = BrowserWindow.fromWebContents(ev.sender) || undefined
        await configWithBrowserAssistant({ autoFind: true, windowOption: { parent, modal: !!parent, show: true } })
        puppeteerExecutable = await getLastUsedAndAvailableBrowser()
      } catch { /**/ }
    }
    if (!puppeteerExecutable) {
      return { ok: false, error: 'NO_BROWSER' }
    }
    bossChatDebugReadyDefer = Promise.withResolvers()
    bossChatDebugProcess = childProcess.spawn(
      process.argv[0],
      process.env.NODE_ENV === 'development'
        ? [process.argv[1], '--mode=bossChatDebugMain']
        : ['--mode=bossChatDebugMain'],
      {
        env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: puppeteerExecutable.executablePath, GEEKGEEKRUND_PIPE_NAME: process.env.GEEKGEEKRUND_PIPE_NAME },
        stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe']
      }
    )
    bossChatDebugProcess.once('exit', () => {
      bossChatDebugProcess = null
      bossChatDebugReadyDefer = null
      mainWindow?.webContents.send('boss-chat-debug-exited')
      for (const [, defer] of bossChatDebugPendingCmds) {
        defer.reject(new Error('worker exited'))
      }
      bossChatDebugPendingCmds.clear()
    })
    // fd3=父写→子读，fd4=子写→父读；主进程从 stdio[4] 读 worker 的 READY/响应
    ;(bossChatDebugProcess.stdio[4] as NodeJS.ReadableStream).pipe(JSONStream.parse()).on('data', (msg: any) => {
      if (msg?.type === 'READY') {
        if (msg.ok) {
          bossChatDebugReadyDefer?.resolve()
          mainWindow?.webContents.send('boss-chat-debug-ready')
        } else {
          bossChatDebugReadyDefer?.reject(new Error(msg.error ?? 'READY failed'))
        }
        return
      }
      // 命令响应（有 id）
      if (msg?.id) {
        const defer = bossChatDebugPendingCmds.get(msg.id)
        if (defer) {
          bossChatDebugPendingCmds.delete(msg.id)
          if (msg.ok) { defer.resolve(msg.result) } else { defer.reject(new Error(msg.error ?? 'command failed')) }
        }
      }
    })
    try {
      await bossChatDebugReadyDefer.promise
      return { ok: true }
    } catch (err: any) {
      closeBossChatDebug()
      return { ok: false, error: err?.message }
    }
  })

  ipcMain.handle('boss-debug-command', async (_, cmd: { type: string; [k: string]: any }) => {
    if (!bossChatDebugProcess || bossChatDebugProcess.killed) {
      return { ok: false, error: 'DEBUG_WORKER_NOT_RUNNING' }
    }
    const id = Math.random().toString(36).slice(2)
    const defer = Promise.withResolvers<any>()
    bossChatDebugPendingCmds.set(id, defer)
    pipeWriteRegardlessError(
      bossChatDebugProcess.stdio[3] as WriteStream,
      JSON.stringify({ ...cmd, id }) + '\n'
    )
    try {
      const result = await Promise.race([
        defer.promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000))
      ])
      return { ok: true, result }
    } catch (err: any) {
      bossChatDebugPendingCmds.delete(id)
      return { ok: false, error: err?.message }
    }
  })

  ipcMain.handle('close-boss-chat-debug', () => {
    closeBossChatDebug()
    return { ok: true }
  })
  // ── end 招聘端调试工具 ───────────────────────────────────────────────────────

  ipcMain.handle('run-boss-auto-browse-and-chat', async () => {
    const mode = 'bossAutoBrowseAndChatMain'
    const { runRecordId } = await runCommon({ mode })
    daemonEE.on('message', function handler(message) {
      if (message.workerId !== mode) {
        return
      }
      if (message.type === 'worker-exited') {
        mainWindow?.webContents.send('worker-exited', message)
      }
    })
    return { runRecordId }
  })

  ipcMain.handle('stop-boss-auto-browse-and-chat', async () => {
    mainWindow?.webContents.send('boss-auto-browse-and-chat-stopping')
    const p = new Promise((resolve) => {
      daemonEE.on('message', function handler(message) {
        if (message.workerId !== 'bossAutoBrowseAndChatMain') {
          return
        }
        if (message.type === 'worker-exited') {
          daemonEE.off('message', handler)
          resolve(undefined)
        }
      })
    })
    await sendToDaemon(
      {
        type: 'stop-worker',
        workerId: 'bossAutoBrowseAndChatMain'
      },
      {
        needCallback: true
      }
    )
    await p
    mainWindow?.webContents.send('boss-auto-browse-and-chat-stopped')
  })

  ipcMain.handle('check-boss-recruiter-cookie-file', async () => {
    const { readStorageFile } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    const cookies = readStorageFile('boss-cookies.json')
    return checkCookieListFormat(cookies)
  })

  ipcMain.handle('save-boss-recruiter-config', async (_, payload) => {
    const { readConfigFile: readBossConfigFile, writeConfigFile: writeBossConfigFile } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    payload = JSON.parse(payload)

    const bossRecruiterConfig = readBossConfigFile('boss-recruiter.json') || {}
    if (hasOwn(payload, 'logLevel')) {
      bossRecruiterConfig.logLevel = payload.logLevel
    }
    if (hasOwn(payload, 'targetJobId')) {
      bossRecruiterConfig.targetJobId = payload.targetJobId
    }
    if (hasOwn(payload, 'autoChat')) {
      bossRecruiterConfig.autoChat = {
        ...bossRecruiterConfig.autoChat,
        ...payload.autoChat
      }
    }
    if (hasOwn(payload, 'chatPage')) {
      const chat = { ...bossRecruiterConfig.chatPage, ...payload.chatPage }
      if (chat.filter) {
        if (Array.isArray(payload.chatPage?.filter?.keywordList)) {
          chat.filter.keywordList = payload.chatPage.filter.keywordList
        } else if (typeof payload.chatPage?.filter?.keywordListStr === 'string') {
          chat.filter.keywordList = payload.chatPage.filter.keywordListStr
            .split(/[，,]/)
            .map((s) => String(s).trim())
            .filter(Boolean)
        }
      }
      bossRecruiterConfig.chatPage = chat
    }
    if (hasOwn(payload, 'recommendPage')) {
      bossRecruiterConfig.recommendPage = {
        ...bossRecruiterConfig.recommendPage,
        ...payload.recommendPage
      }
    }

    const candidateFilterConfig = readBossConfigFile('candidate-filter.json') || {}
    if (hasOwn(payload, 'expectCityList')) {
      candidateFilterConfig.expectCityList = payload.expectCityList
    }
    if (hasOwn(payload, 'expectEducationRegExpStr')) {
      candidateFilterConfig.expectEducationRegExpStr = payload.expectEducationRegExpStr
    }
    if (hasOwn(payload, 'expectWorkExpRange')) {
      candidateFilterConfig.expectWorkExpRange = payload.expectWorkExpRange
    }
    if (hasOwn(payload, 'expectSalaryRange')) {
      candidateFilterConfig.expectSalaryRange = payload.expectSalaryRange
    }
    if (hasOwn(payload, 'expectSalaryWhenNegotiable')) {
      candidateFilterConfig.expectSalaryWhenNegotiable = payload.expectSalaryWhenNegotiable
    }
    if (hasOwn(payload, 'expectSkillKeywords')) {
      candidateFilterConfig.expectSkillKeywords = payload.expectSkillKeywords
    }
    if (hasOwn(payload, 'blockCandidateNameRegExpStr')) {
      candidateFilterConfig.blockCandidateNameRegExpStr = payload.blockCandidateNameRegExpStr
    }
    if (hasOwn(payload, 'skipViewedCandidates')) {
      candidateFilterConfig.skipViewedCandidates = payload.skipViewedCandidates
    }

    return await Promise.all([
      writeBossConfigFile('boss-recruiter.json', bossRecruiterConfig),
      writeBossConfigFile('candidate-filter.json', candidateFilterConfig)
    ])
  })

  ipcMain.handle('fetch-boss-recruiter-config-file-content', async () => {
    const { readConfigFile: readBossConfigFile } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    return {
      config: {
        'boss-recruiter.json': readBossConfigFile('boss-recruiter.json'),
        'candidate-filter.json': readBossConfigFile('candidate-filter.json')
      }
    }
  })

  ipcMain.handle('fetch-boss-jobs-config', async () => {
    const { readBossJobsConfig } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    return readBossJobsConfig()
  })

  ipcMain.handle('save-boss-jobs-config', async (_, payload) => {
    const { readBossJobsConfig, writeBossJobsConfig } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    const incoming = typeof payload === 'string' ? JSON.parse(payload) : payload
    const existing = readBossJobsConfig()
    const config = {
      ...existing,
      jobs: incoming.jobs ?? existing.jobs ?? []
    }
    return await writeBossJobsConfig(config)
  })

  ipcMain.handle('generate-llm-rubric', async (_, payload: { sourceJd?: string; modelId?: string | null }) => {
    const { setLevel, debug: logDebug, info: logInfo, error: logError } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/logger.mjs'
    )
    const { readConfigFile } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    const config = readConfigFile('boss-recruiter.json') || {}
    setLevel((config as { logLevel?: string }).logLevel || 'info')

    const LOG = '[generate-llm-rubric/ipc]'
    const { generateRubricFromJd } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/llm-rubric.mjs'
    )
    const sourceJd = typeof payload?.sourceJd === 'string' ? payload.sourceJd : ''
    const modelId = typeof payload?.modelId === 'string' ? payload.modelId : null
    logInfo(LOG, 'start', { jdChars: sourceJd.length, modelId })
    try {
      const res = await generateRubricFromJd(sourceJd, { modelId })
      logDebug(LOG, 'done', { knockouts: res?.rubric?.knockouts?.length, dims: res?.rubric?.dimensions?.length })
      return res
    } catch (err: any) {
      logError(LOG, 'error', err?.message ?? err)
      throw err
    }
  })

  // ── 调试工具 LLM 接口 ─────────────────────────────────────────────────────────
  // llm-screen-resume: 主进程侧直接调用 evaluateResumeByRubric，无需浏览器
  ipcMain.handle('llm-screen-resume', async (_, payload: {
    resumeText: string
    jobId?: string
    rubric?: { knockouts: string[]; dimensions: any[]; passThreshold?: number }
  }) => {
    const { evaluateResumeByRubric } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/llm-rubric.mjs'
    ) as any
    const { readBossJobsConfig } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )

    let rubricConfig: { knockouts?: string[]; dimensions?: any[]; passThreshold?: number } | null = null

    if (payload?.jobId) {
      const jobsConfig = readBossJobsConfig()
      const job = (jobsConfig.jobs || []).find((j: any) => (j.jobId ?? j.id) === payload.jobId)
      const llmConfig = job?.filter?.resumeLlmConfig
      if (llmConfig?.rubric) {
        rubricConfig = {
          knockouts: llmConfig.rubric.knockouts,
          dimensions: llmConfig.rubric.dimensions,
          passThreshold: llmConfig.passThreshold ?? 75
        }
      }
    } else if (payload?.rubric) {
      rubricConfig = payload.rubric
    }

    if (!rubricConfig) {
      return { ok: false, error: '未找到 Rubric 配置，请选择已配置 LLM 的职位或手动填写 Rubric JSON' }
    }

    const result = await evaluateResumeByRubric(payload.resumeText ?? '', rubricConfig)
    return { ok: true, ...result }
  })
  ipcMain.handle('apply-rubric-to-job', async (_, payload: {
    jobId: string
    rubric: { knockouts: string[]; dimensions: any[] }
    passThreshold?: number
  }) => {
    const { readBossJobsConfig, writeBossJobsConfig } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )
    const config = readBossJobsConfig()
    const jobs: any[] = config.jobs ?? []
    const idx = jobs.findIndex((j: any) => (j.jobId ?? j.id) === payload.jobId)
    if (idx === -1) return { ok: false, error: `未找到职位 ${payload.jobId}` }
    const job = jobs[idx]
    if (!job.filter) job.filter = {}
    if (!job.filter.resumeLlmConfig) job.filter.resumeLlmConfig = {}
    job.filter.resumeLlmEnabled = true
    job.filter.resumeLlmConfig.rubric = { knockouts: payload.rubric.knockouts, dimensions: payload.rubric.dimensions }
    job.filter.resumeLlmConfig.passThreshold = payload.passThreshold ?? 75
    await writeBossJobsConfig({ ...config, jobs })
    return { ok: true }
  })
  // ── end 调试工具 LLM 接口 ──────────────────────────────────────────────────────

  ipcMain.handle('sync-boss-job-list', async (ev) => {
    const { setLevel, debug: logDebug, info: logInfo } = await import(
      '@geekgeekrun/boss-auto-browse-and-chat/logger.mjs'
    )
    const { readConfigFile, readBossJobsConfig, writeBossJobsConfig, readStorageFile: readBossStorageFile } =
      await import('@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs')
    const config = readConfigFile('boss-recruiter.json') || {}
    setLevel((config as { logLevel?: string }).logLevel || 'info')

    const LOG = '[sync-boss-job-list]'
    const sendToGui = (message: string) => {
      mainWindow?.webContents?.send('worker-to-gui-message', {
        data: { type: 'worker-log' as const, workerId: 'syncBossJobList', message }
      })
    }
    const toStr = (msg: string, ...rest: unknown[]) =>
      [msg, ...rest].map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    const log = (msg: string, ...rest: unknown[]) => {
      logInfo(LOG, msg, ...rest)
      sendToGui(toStr(msg, ...rest))
    }
    const logDebugSync = (msg: string, ...rest: unknown[]) => {
      logDebug(LOG, msg, ...rest)
      sendToGui(toStr(msg, ...rest))
    }

    log('查找可用浏览器...')
    let puppeteerExecutable = await getLastUsedAndAvailableBrowser()
    if (!puppeteerExecutable) {
      try {
        const parent = BrowserWindow.fromWebContents(ev.sender) || undefined
        await configWithBrowserAssistant({
          autoFind: true,
          windowOption: { parent, modal: !!parent, show: true }
        })
        puppeteerExecutable = await getLastUsedAndAvailableBrowser()
      } catch {
        //
      }
    }
    if (!puppeteerExecutable) {
      log('未找到可用浏览器')
      throw new Error('NO_BROWSER')
    }
    log(`使用浏览器: ${puppeteerExecutable.executablePath}`)

    log('初始化 Puppeteer...')
    const { initPuppeteer } = await import('@geekgeekrun/boss-auto-browse-and-chat/index.mjs') as any
    process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerExecutable.executablePath
    const { puppeteer } = await initPuppeteer()

    const bossCookies = readBossStorageFile('boss-cookies.json')
    const { setDomainLocalStorage } = await import('@geekgeekrun/utils/puppeteer/local-storage.mjs') as any
    const bossLocalStorage = readBossStorageFile('boss-local-storage.json')

    // 与招聘端调试工具一致：非 headless、相同 viewport 与 protocolTimeout，避免站点对 headless 做差异化或拦截
    log('启动浏览器（非 headless，与调试工具一致）...')
    const browser = await puppeteer.launch({
      headless: false,
      ignoreHTTPSErrors: true,
      protocolTimeout: 120000,
      defaultViewport: { width: 1440, height: 900 - 140 }
    })

    const {
      BOSS_CHAT_INDEX_URL,
      CHAT_PAGE_JOB_DROPDOWN_SELECTOR,
      CHAT_PAGE_JOB_ITEM_SELECTOR
    } = await import('@geekgeekrun/boss-auto-browse-and-chat/constant.mjs')

    try {
      const page = (await browser.pages())[0]
      if (Array.isArray(bossCookies) && bossCookies.length > 0) {
        log(`注入 ${bossCookies.length} 条 Cookie`)
        await page.setCookie(...bossCookies)
      }
      await setDomainLocalStorage(browser, 'https://www.zhipin.com/desktop/', bossLocalStorage || {})

      log(`导航到沟通页: ${BOSS_CHAT_INDEX_URL}`)
      await page.goto(BOSS_CHAT_INDEX_URL, { timeout: 60000 })
      const urlAfterGoto = page.url()
      logDebugSync(`goto 后当前 URL: ${urlAfterGoto}`)

      logDebugSync('等待 document.readyState === complete...')
      await page.waitForFunction(
        () => document.readyState === 'complete',
        { timeout: 120000 }
      )
      await new Promise((r) => setTimeout(r, 1500))
      const urlAfterReady = page.url()
      logDebugSync(`readyState 完成且等待 1.5s 后 URL: ${urlAfterReady}`)

      if (
        urlAfterReady.startsWith('https://www.zhipin.com/web/common/403.html') ||
        urlAfterReady.startsWith('https://www.zhipin.com/web/common/error.html')
      ) {
        log('当前为 403/error 页，拒绝访问')
        throw new Error('ACCESS_IS_DENIED')
      }
      const needLogin = await page.evaluate(
        (chatUrl: string) => {
          const href = location.href
          return (
            !href.startsWith(chatUrl) ||
            /\/login|\/wapi\/zppassport\//.test(href)
          )
        },
        BOSS_CHAT_INDEX_URL
      )
      logDebugSync(`needLogin=${needLogin}`)
      if (needLogin) {
        log('未在沟通页或需登录，抛出 NEED_LOGIN')
        throw new Error('NEED_LOGIN')
      }

      logDebugSync(`等待职位下拉按钮: ${CHAT_PAGE_JOB_DROPDOWN_SELECTOR}`)
      await page.waitForSelector(CHAT_PAGE_JOB_DROPDOWN_SELECTOR, { timeout: 30000 })
      logDebugSync('职位下拉按钮已出现，点击展开')
      await page.click(CHAT_PAGE_JOB_DROPDOWN_SELECTOR)
      logDebugSync(`等待职位列表项: ${CHAT_PAGE_JOB_ITEM_SELECTOR}`)
      await page.waitForSelector(CHAT_PAGE_JOB_ITEM_SELECTOR, { timeout: 10000 })

      const fetchedJobs: Array<{ jobId: string; jobName: string }> = await page.evaluate(
        (sel: string) => {
          const items = document.querySelectorAll(sel)
          return Array.from(items)
            .map((li: Element) => ({
              jobId: (li as HTMLElement).getAttribute('value') || '',
              jobName: (li.textContent || '').trim()
            }))
            .filter((j) => j.jobId && j.jobId !== '-1')
        },
        CHAT_PAGE_JOB_ITEM_SELECTOR
      )
      log(`已获取职位数: ${fetchedJobs.length}`)

      const existing = readBossJobsConfig()
      const existingMap = new Map((existing.jobs || []).map((j: any) => [j.jobId ?? j.id, j]))

      const mergedJobs = fetchedJobs.map((j) => {
        const prev = existingMap.get(j.jobId)
        if (prev) {
          return { ...prev, jobName: j.jobName }
        }
        return {
          jobId: j.jobId,
          jobName: j.jobName,
          sequence: { enabled: true, runRecommend: true, runChat: true },
          candidateFilter: {},
          autoChat: {},
          chatPage: {}
        }
      })

      const updatedConfig = { ...existing, jobs: mergedJobs }
      await writeBossJobsConfig(updatedConfig)
      log('同步完成，已保存配置')
      return { jobs: mergedJobs }
    } catch (err: any) {
      try {
        const pages = await browser.pages()
        const p = pages[0]
        if (p && !p.isClosed()) {
          const debugUrl = p.url()
          const debugTitle = await p.title()
          logDebugSync(`出错时页面 URL: ${debugUrl}, title: ${debugTitle}`)
        }
      } catch (_) {
        // 忽略调试信息获取失败
      }
      throw err
    } finally {
      try {
        log('关闭浏览器...')
        await browser.close()
      } catch {
        //
      }
    }
  })
}
