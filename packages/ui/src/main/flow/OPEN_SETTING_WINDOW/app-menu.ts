import { app, Menu, MenuItemConstructorOptions, MenuItem } from 'electron'

const isMac = process.platform === 'darwin'

const template: (MenuItemConstructorOptions | MenuItem)[] = [
  // { role: 'appMenu' }
  ...(isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        }
      ]
    : [])
]
const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)
