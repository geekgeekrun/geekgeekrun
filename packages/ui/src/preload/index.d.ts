import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
  }
  declare const electron: Window['electron']
  declare const api: Window['api']
}
