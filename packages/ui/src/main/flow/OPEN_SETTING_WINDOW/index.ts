import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from '../../window/mainWindow'
import { initTray } from '../../features/tray'
import './app-menu'
import initIpc from './ipc'
import gtag from '../../utils/gtag'
import initPublicIpc from '../../utils/initPublicIpc'
import { sendToDaemon, closeDaemonClient } from './connect-to-daemon'

export function openSettingWindow() {
  // TODO: singleton lock; how can we check if there is another process should run as singleton with arguments?
  if (!app.requestSingleInstanceLock()) {
    // TODO: log
    app.exit(0)
  }

  const whenReadyPromise = app.whenReady()

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  whenReadyPromise.then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    initTray()
    app.dock?.hide()
    createMainWindow()

    // IPC test
    ipcMain.on('ping', () => console.log('pong'))
    initPublicIpc()
    initIpc()

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })

    gtag('ui_ready')
  })

  // In menubar mode, closing all windows should keep the app alive. The Tray
  // quit item is responsible for intentionally exiting the app.
  app.on('window-all-closed', () => {
    // keep daemon and tray alive
  })

  // In this file you can include the rest of your app"s specific main process
  // code. You can also put them in separate files and require them here.

  // short cut
  whenReadyPromise.then(() => {
    // Register a 'Command+Option+Shift+/' shortcut listener.
    globalShortcut.register('Command+Option+Shift+/', () => {
      console.log('Command+Option+Shift+/ is pressed')
      app.exit(0)
    })
    app.once('quit', () => {
      globalShortcut.unregister('Command+Option+Shift+/')
    })
  })

  whenReadyPromise.then(async () => {
    await sendToDaemon(
      {
        type: 'ping'
      },
      {
        needCallback: true
      }
    )
    await sendToDaemon(
      {
        type: 'user-process-register'
      },
      {
        needCallback: true
      }
    )
  })
  app.on('before-quit', closeDaemonClient)
}
