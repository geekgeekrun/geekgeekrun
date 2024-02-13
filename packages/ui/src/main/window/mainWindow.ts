import { BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import * as childProcess from 'node:child_process'
import { is } from '@electron-toolkit/utils'
import {
  readConfigFile,
  configFileNameList,
  ensureConfigFileExist,
  writeConfigFile
} from '@bossgeekgo/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { ChildProcess } from 'child_process'
let mainWindow: BrowserWindow

export function createMainWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux'
      ? {
          /* icon */
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  is.dev && mainWindow.webContents.openDevTools()

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  ipcMain.handle('fetch-config-file-content', async () => {
    const fileContentList = configFileNameList.map((fileName) => {
      return readConfigFile(fileName)
    })
    const result = {}

    configFileNameList.forEach((fileName, index) => {
      result[fileName] = fileContentList[index]
    })
    return result
  })

  ipcMain.handle('save-config-file-from-ui', async (ev, payload) => {
    payload = JSON.parse(payload)
    ensureConfigFileExist()

    const dingtalkConfig = readConfigFile('dingtalk.json')
    dingtalkConfig.groupRobotAccessToken = payload.dingtalkRobotAccessToken

    const bossZhipinConfig = readConfigFile('boss.json')
    bossZhipinConfig.cookies = JSON.parse(payload.bossZhipinCookies)

    return await Promise.all([
      writeConfigFile('boss.json', bossZhipinConfig),
      writeConfigFile('dingtalk.json', dingtalkConfig),
      writeConfigFile('target-company-list.json', payload.expectCompanies.split(','))
    ])
  })

  // const currentExecutablePath = app.getPath('exe')
  // console.log(currentExecutablePath)

  let subProcessOfPuppeteer: ChildProcess | null = null
  ipcMain.handle('run-geek-auto-start-chat-with-boss', async () => {
    if (subProcessOfPuppeteer) {
      return
    }
    try {
      await import('@bossgeekgo/geek-auto-start-chat-with-boss/index.mjs')
    } catch (err){
      console.log(err) // TODO: what's the error?
      throw new Error('PUPPETEER_MAY_NOT_INSTALLED')
    }
    console.log(process)
    subProcessOfPuppeteer = childProcess.spawn(process.argv[0], process.argv.slice(1), {
      env: {
        ...process.env,
        MAIN_BOSSGEEKGO_RUN_MODE: 'geekAutoStartWithBoss'
      }
    })
    ipcMain.emit('geek-auto-start-chat-with-boss-started')
    subProcessOfPuppeteer.once('exit', () => {
      mainWindow.webContents.send('geek-auto-start-chat-with-boss-stopped')

      subProcessOfPuppeteer = null
    })
    console.log(subProcessOfPuppeteer)
  })
  ipcMain.handle('stop-geek-auto-start-chat-with-boss', async () => {
    mainWindow.webContents.send('geek-auto-start-chat-with-boss-stopping')
    subProcessOfPuppeteer?.kill('SIGINT')
  })
}
