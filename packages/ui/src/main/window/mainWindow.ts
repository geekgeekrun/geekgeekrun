import { BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import {
  readConfigFile,
  configFileNameList,
  ensureConfigFileExist,
  writeConfigFile
} from '@bossgeekgo/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
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
}
