import { ipcMain, shell, app } from 'electron'
import path from 'path'
import * as childProcess from 'node:child_process'
import {
  ensureConfigFileExist,
  ensureStorageFileExist,
  configFileNameList,
  readConfigFile,
  writeConfigFile,
  readStorageFile,
  writeStorageFile,
  storageFilePath
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { ChildProcess } from 'child_process'
import * as JSONStream from 'JSONStream'
import { checkCookieListFormat } from '../../../../common/utils/cookie'
import { getAnyAvailablePuppeteerExecutable } from '../../../flow/CHECK_AND_DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable/index'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { AUTO_CHAT_ERROR_EXIT_CODE } from '../../../../common/enums/auto-start-chat'
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
} from '../../READ_NO_REPLY_AUTO_REMINDER/boss-operation'
import {
  autoReminderPromptTemplateFileName,
  writeDefaultAutoRemindPrompt
} from '../../READ_NO_REPLY_AUTO_REMINDER/boss-operation'
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

    promiseArr.push(writeConfigFile('boss.json', bossConfig))

    if (hasOwn(payload, 'expectCompanies')) {
      promiseArr.push(
        writeConfigFile('target-company-list.json', payload.expectCompanies?.split(',') ?? [])
      )
    }

    return await Promise.all(promiseArr)
  })

  ipcMain.handle('read-storage-file', async (ev, payload) => {
    ensureStorageFileExist()
    return await readStorageFile(payload.fileName)
  })

  ipcMain.handle('write-storage-file', async (ev, payload) => {
    ensureStorageFileExist()

    return await writeStorageFile(payload.fileName, JSON.parse(payload.data))
  })

  // const currentExecutablePath = app.getPath('exe')
  // console.log(currentExecutablePath)
  ipcMain.handle('prepare-run-geek-auto-start-chat-with-boss', async () => {
    mainWindow?.webContents.send('locating-puppeteer-executable')
    const puppeteerExecutable = await getAnyAvailablePuppeteerExecutable()
    if (!puppeteerExecutable) {
      return Promise.reject('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')
    }
    mainWindow?.webContents.send('puppeteer-executable-is-located')
  })

  let subProcessOfPuppeteer: ChildProcess | null = null
  ipcMain.handle('run-geek-auto-start-chat-with-boss', async () => {
    if (subProcessOfPuppeteer) {
      return
    }
    const puppeteerExecutable = await getAnyAvailablePuppeteerExecutable()
    if (!puppeteerExecutable) {
      return Promise.reject('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')
    }
    const subProcessEnv = {
      ...process.env,
      PUPPETEER_EXECUTABLE_PATH: puppeteerExecutable.executablePath
    }
    subProcessOfPuppeteer = childProcess.spawn(
      process.argv[0],
      [
        process.argv[1],
        `--mode=geekAutoStartWithBossDaemon`,
        `--mode-to-daemon=geekAutoStartWithBossMain`
      ],
      {
        env: subProcessEnv,
        stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'ipc']
      }
    )
    // console.log(subProcessOfPuppeteer)
    return new Promise((resolve, reject) => {
      subProcessOfPuppeteer!.stdio[3]!.pipe(JSONStream.parse()).on('data', async (raw) => {
        const data = raw
        switch (data.type) {
          case 'GEEK_AUTO_START_CHAT_WITH_BOSS_STARTED': {
            resolve(data)
            break
          }
          case 'LOGIN_STATUS_INVALID': {
            await sleep(500)
            mainWindow?.webContents.send('check-boss-zhipin-cookie-file')
            return
          }
          default: {
            return
          }
        }
      })

      subProcessOfPuppeteer!.once('exit', (exitCode) => {
        subProcessOfPuppeteer = null
        if (exitCode === AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE) {
          // means cannot find downloaded puppeteer
          reject('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')
        } else {
          mainWindow?.webContents.send('geek-auto-start-chat-with-boss-stopped')
        }
      })
    })
    // TODO:
  })

  ipcMain.handle('run-read-no-reply-auto-reminder', async () => {
    if (subProcessOfPuppeteer) {
      return
    }
    const puppeteerExecutable = await getAnyAvailablePuppeteerExecutable()
    if (!puppeteerExecutable) {
      return Promise.reject('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')
    }
    const subProcessEnv = {
      ...process.env,
      PUPPETEER_EXECUTABLE_PATH: puppeteerExecutable.executablePath
    }
    subProcessOfPuppeteer = childProcess.spawn(
      process.argv[0],
      [process.argv[1], `--mode=readNoReplyAutoReminder`],
      {
        env: subProcessEnv,
        stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'ipc']
      }
    )
    // console.log(subProcessOfPuppeteer)
    return new Promise((resolve, reject) => {
      subProcessOfPuppeteer!.stdio[3]!.pipe(JSONStream.parse()).on('data', async (raw) => {
        const data = raw
        switch (data.type) {
          case 'LOGIN_STATUS_INVALID': {
            await sleep(500)
            mainWindow?.webContents.send('check-boss-zhipin-cookie-file')
            return
          }
          case 'ERR_INTERNET_DISCONNECTED': {
            mainWindow?.webContents.send('toast-message', {
              type: 'error',
              message: '联网失败，请检查网络连接'
            })
            return
          }
          default: {
            return
          }
        }
      })

      subProcessOfPuppeteer!.once('exit', (exitCode) => {
        subProcessOfPuppeteer = null
        if (exitCode === AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE) {
          // means cannot find downloaded puppeteer
          reject('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')
        } else {
          mainWindow?.webContents.send('geek-auto-start-chat-with-boss-stopped')
        }
      })

      resolve(true)
    })
    // TODO:
  })

  ipcMain.handle('check-dependencies', async () => {
    const [anyAvailablePuppeteerExecutable] = await Promise.all([
      getAnyAvailablePuppeteerExecutable()
    ])
    return {
      puppeteerExecutableAvailable: !!anyAvailablePuppeteerExecutable
    }
  })

  let subProcessOfCheckAndDownloadDependencies: ChildProcess | null = null
  ipcMain.handle('setup-dependencies', async () => {
    if (subProcessOfCheckAndDownloadDependencies) {
      return
    }
    subProcessOfCheckAndDownloadDependencies = childProcess.spawn(
      process.argv[0],
      [process.argv[1], `--mode=checkAndDownloadDependenciesForInit`],
      {
        stdio: [null, null, null, 'pipe', 'ipc']
      }
    )
    return new Promise((resolve, reject) => {
      subProcessOfCheckAndDownloadDependencies!.stdio[3]!.pipe(JSONStream.parse()).on(
        'data',
        (raw) => {
          const data = raw
          switch (data.type) {
            case 'NEED_RESETUP_DEPENDENCIES':
            case 'PUPPETEER_DOWNLOAD_PROGRESS': {
              mainWindow?.webContents.send(data.type, data)
              break
            }
            case 'PUPPETEER_DOWNLOAD_ENCOUNTER_ERROR': {
              console.error(data)
              break
            }
            default: {
              return
            }
          }
        }
      )
      subProcessOfCheckAndDownloadDependencies!.once('exit', (exitCode) => {
        switch (exitCode) {
          case 0: {
            resolve(exitCode)
            break
          }
          default: {
            reject('PUPPETEER_DOWNLOAD_ENCOUNTER_ERROR')
            break
          }
        }
        subProcessOfCheckAndDownloadDependencies = null
      })
    })
  })

  ipcMain.handle('stop-geek-auto-start-chat-with-boss', async () => {
    mainWindow?.webContents.send('geek-auto-start-chat-with-boss-stopping')
    subProcessOfPuppeteer?.kill()
    setTimeout(() => {
      try {
        subProcessOfPuppeteer?.kill('SIGKILL')
      } catch {
        //
      }
    }, 1000)
  })

  let subProcessOfBossZhipinLoginPageWithPreloadExtension: ChildProcess | null = null
  ipcMain.on('launch-bosszhipin-login-page-with-preload-extension', async () => {
    try {
      subProcessOfBossZhipinLoginPageWithPreloadExtension?.kill()
    } catch {
      //
    }
    const subProcessEnv = {
      ...process.env,
      PUPPETEER_EXECUTABLE_PATH: (await getAnyAvailablePuppeteerExecutable())!.executablePath
    }
    subProcessOfBossZhipinLoginPageWithPreloadExtension = childProcess.spawn(
      process.argv[0],
      [process.argv[1], `--mode=launchBossZhipinLoginPageWithPreloadExtension`],
      {
        env: subProcessEnv,
        stdio: [null, null, null, 'pipe', 'ipc']
      }
    )
    subProcessOfBossZhipinLoginPageWithPreloadExtension!.stdio[3]!.pipe(JSONStream.parse()).on(
      'data',
      (raw) => {
        const data = raw
        switch (data.type) {
          case 'BOSS_ZHIPIN_COOKIE_COLLECTED': {
            mainWindow?.webContents.send(data.type, data)
            break
          }
          default: {
            return
          }
        }
      }
    )

    subProcessOfBossZhipinLoginPageWithPreloadExtension!.once('exit', () => {
      mainWindow?.webContents.send('BOSS_ZHIPIN_LOGIN_PAGE_CLOSED')
      subProcessOfBossZhipinLoginPageWithPreloadExtension = null
    })
  })
  ipcMain.on('kill-bosszhipin-login-page-with-preload-extension', async () => {
    try {
      subProcessOfBossZhipinLoginPageWithPreloadExtension?.kill()
    } catch {
      //
    } finally {
      subProcessOfBossZhipinLoginPageWithPreloadExtension = null
    }
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
  ipcMain.handle('open-site-with-boss-cookie', async (_, data) => {
    const url = data.url
    if (
      !subProcessOfOpenBossSiteDefer ||
      !subProcessOfOpenBossSite ||
      subProcessOfOpenBossSite.killed
    ) {
      subProcessOfOpenBossSiteDefer = Promise.withResolvers()
      const puppeteerExecutable = await getAnyAvailablePuppeteerExecutable()
      const subProcessEnv = {
        ...process.env,
        PUPPETEER_EXECUTABLE_PATH: puppeteerExecutable!.executablePath
      }
      subProcessOfOpenBossSite = childProcess.spawn(
        process.argv[0],
        [process.argv[1], `--mode=launchBossSite`],
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

  ipcMain.handle('exit-app-immediately', () => {
    app.exit(0)
  })
}
