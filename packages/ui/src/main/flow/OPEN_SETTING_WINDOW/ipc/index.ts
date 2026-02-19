import { ipcMain, shell, app, dialog, BrowserWindow } from 'electron'
import path from 'path'
import * as childProcess from 'node:child_process'
import {
  ensureConfigFileExist,
  configFileNameList,
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
  autoReminderPromptTemplateFileName,
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
import { createCommonJobConditionConfigWindow } from '../../../window/commonJobConditionConfigWindow'

export default function initIpc() {
  ipcMain.handle('fetch-config-file-content', async () => {
    const configFileContentList = configFileNameList.map((fileName) => {
      return readConfigFile(fileName)
    })
    const result = {
      config: {}
    }

    configFileNameList.forEach((fileName, index) => {
      result.config[fileName] = configFileContentList[index]
    })

    return result
  })

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
    const defer = Promise.withResolvers()
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

  ipcMain.handle('resume-edit', async () => {
    createResumeEditorWindow({
      parent: mainWindow!,
      modal: true,
      show: true
    })
    const defer = Promise.withResolvers()
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
  ipcMain.on('no-reply-reminder-prompt-edit', async () => {
    const template = await readStorageFile(autoReminderPromptTemplateFileName, { isJson: false })
    if (!template) {
      await writeDefaultAutoRemindPrompt()
    }
    const filePath = path.join(storageFilePath, autoReminderPromptTemplateFileName)
    shell.openPath(filePath)
  })
  ipcMain.on('close-resume-editor', () => resumeEditorWindow?.close())
  ipcMain.handle('check-if-auto-remind-prompt-valid', async () => {
    await getValidTemplate()
  })
  ipcMain.handle('check-is-resume-content-valid', async () => {
    const res = (await readConfigFile('resumes.json'))?.[0]
    return checkIsResumeContentValid(res)
  })
  ipcMain.handle('resume-content-enough-detect', async () => {
    const res = (await readConfigFile('resumes.json'))?.[0]
    return resumeContentEnoughDetect(res)
  })
  ipcMain.handle('overwrite-auto-remind-prompt-with-default', async () => {
    await writeDefaultAutoRemindPrompt()
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
    createCommonJobConditionConfigWindow({
      parent: mainWindow!,
      modal: true,
      show: true
    })
  })

  ipcMain.handle('exit-app-immediately', () => {
    app.exit(0)
  })
}
