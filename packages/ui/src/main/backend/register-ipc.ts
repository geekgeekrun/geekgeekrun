import { ipcMain } from 'electron'
import { checkCookieListFormat } from '../../common/utils/cookie'
import { requestBackend } from './client'

type ConfigResponse<T = unknown> = { data: T }
type RecordPage<T = unknown> = { items: T[]; total: number; page: number; pageSize: number }

export const readBackendConfig = <T = unknown>(resource: string) =>
  requestBackend<ConfigResponse<T>>('config.read', { resource }).then(({ data }) => data)

export const writeBackendConfig = <T = unknown>(resource: string, patch: T) =>
  requestBackend<ConfigResponse<T>>('config.write', { resource, patch }).then(({ data }) => data)

export const listBackendRecords = <T = unknown>(resource: string, payload: Record<string, unknown> = {}) =>
  requestBackend<RecordPage<T>>('records.list', { resource, ...payload })

async function fetchLegacyConfigFiles() {
  const [boss, dingtalk, targetCompanies, llm, jobIntention, resumes] = await Promise.all([
    readBackendConfig('opening_message'),
    readBackendConfig('notification_config'),
    readBackendConfig('target_companies'),
    readBackendConfig('llm_config'),
    readBackendConfig('job_intention'),
    readBackendConfig('resumes')
  ])
  return {
    config: {
      'boss.json': boss,
      'dingtalk.json': dingtalk,
      'target-company-list.json': targetCompanies,
      'llm.json': llm,
      'common-job-condition-config.json': jobIntention,
      'resumes.json': resumes
    }
  }
}

async function saveLegacyConfig(payload: string) {
  const value = JSON.parse(payload) as Record<string, unknown>
  const { expectCompanies, dingtalkRobotAccessToken, ...bossPatch } = value
  delete bossPatch.expectJobRegExpStr
  const writes: Array<Promise<unknown>> = [writeBackendConfig('opening_message', bossPatch)]
  if (dingtalkRobotAccessToken !== undefined) {
    writes.push(writeBackendConfig('notification_config', { groupRobotAccessToken: dingtalkRobotAccessToken }))
  }
  if (expectCompanies !== undefined) {
    writes.push(writeBackendConfig('target_companies', String(expectCompanies).split(',')))
  }
  return await Promise.all(writes)
}

async function listLegacyRecords(resource: string, payload: { pageNo?: number; pageSize?: number } = {}) {
  const page = await listBackendRecords(resource, {
    page: payload.pageNo ?? 1,
    pageSize: payload.pageSize ?? 10
  })
  return {
    data: {
      data: page.items,
      totalItemCount: page.total,
      pageNo: page.page
    }
  }
}

export function registerBackendIpc(): void {
  ipcMain.handle('fetch-config-file-content', fetchLegacyConfigFiles)
  ipcMain.handle('save-config-file-from-ui', (_event, payload) => saveLegacyConfig(payload))
  ipcMain.handle('check-boss-zhipin-cookie-file', async () =>
    checkCookieListFormat(await readBackendConfig('boss_cookies'))
  )
  ipcMain.handle('get-auto-start-chat-record', (_event, payload) => listLegacyRecords('autoStartChats', payload))
  ipcMain.handle('get-mark-as-not-suit-record', (_event, payload) => listLegacyRecords('markAsNotSuit', payload))
  ipcMain.handle('get-job-library', (_event, payload) => listLegacyRecords('jobs', payload))
  ipcMain.handle('get-boss-library', (_event, payload) => listLegacyRecords('bosses', payload))
  ipcMain.handle('get-company-library', (_event, payload) => listLegacyRecords('companies', payload))
  ipcMain.handle('get-job-history-by-encrypt-id', async (_event, encryptJobId) => ({
    data: (await listBackendRecords('jobHistory', {
      page: 1,
      pageSize: 100,
      filters: { encryptJobId }
    })).items
  }))
}
