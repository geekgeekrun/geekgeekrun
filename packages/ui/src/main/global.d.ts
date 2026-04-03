interface BossJobEntry {
  id: string
  name: string
  sequence?: { enabled?: boolean; runRecommend?: boolean; runChat?: boolean }
  overrides?: Record<string, any>
  [key: string]: any
}

interface BossJobsConfig {
  jobs: BossJobEntry[]
  [key: string]: any
}

declare module '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs' {
  export const configFolderPath: string
  export const storageFilePath: string
  export const configFileNameList: string[]
  export const storageFileNameList: string[]
  export function ensureConfigFileExist(): void
  export function ensureStorageFileExist(): void
  export function readConfigFile(fileName: string): any
  export function writeConfigFile(fileName: string, content: any, options?: { isSync?: boolean }): Promise<void>
  export function readStorageFile(fileName: string, options?: { isJson?: boolean }): any
  export function writeStorageFile(fileName: string, content: any, options?: { isJson?: boolean }): Promise<void>
  export function readBossJobsConfig(): BossJobsConfig
  export function writeBossJobsConfig(config: BossJobsConfig): Promise<void>
  export function getMergedJobConfig(jobId: string | null | undefined): Record<string, any>
  export function readBossLlmConfig(): {
    providers: Array<{
      id: string
      name: string
      baseURL: string
      apiKey: string
      models: Array<{
        id: string
        name: string
        model: string
        enabled: boolean
        thinking?: { enabled: boolean; budget: number }
      }>
    }>
    purposeDefaultModelId: Record<string, string>
  }
  export function writeBossLlmConfig(config: any): Promise<void>
}

declare module '@geekgeekrun/utils/puppeteer/local-storage.mjs' {
  export function setDomainLocalStorage(browser: any, url: string, storage: Record<string, any>): Promise<void>
}

declare module '@geekgeekrun/boss-auto-browse-and-chat/index.mjs' {
  import { EventEmitter } from 'node:events'
  export const bossAutoBrowseEventBus: EventEmitter
  export function initPuppeteer(): Promise<any>
  export default function startBossAutoBrowse(hooks: any, opts?: { returnBrowser?: boolean }): Promise<void | { browser: any; page: any }>
  export function startBossChatPageProcess(hooks: any, options?: { browser?: any; page?: any }): Promise<void>
}
