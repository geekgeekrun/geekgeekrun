import { ipcMain } from 'electron'
import { requestBackend } from './client'
import type { PageResult } from '@geekgeekrun/ggr-protocol'

type ConfigResponse<T = unknown> = { data: T }
type RecordPage<T = unknown> = { items: T[]; total: number; page: number; pageSize: number }

export const readBackendConfig = <T = unknown>(resource: string) =>
  requestBackend<ConfigResponse<T>>('config.read', { resource }).then(({ data }) => data)

export const writeBackendConfig = <T = unknown>(resource: string, patch: T) =>
  requestBackend<ConfigResponse<T>>('config.write', { resource, patch }).then(({ data }) => data)

export const listBackendRecords = <T = unknown>(
  resource: string,
  payload: Record<string, unknown> = {}
) => requestBackend<RecordPage<T>>('records.list', { resource, ...payload })

async function fetchLegacyConfigFiles() {
  const [
    boss,
    dingtalk,
    targetCompanies,
    llm,
    jobIntention,
    resumes,
    filterConditions,
    industryFilterExemptions,
    cityGroups
  ] = await Promise.all([
    readBackendConfig('opening_message'),
    readBackendConfig('notification_config'),
    readBackendConfig('target_companies'),
    readBackendConfig('llm_config'),
    readBackendConfig('job_intention'),
    readBackendConfig('resumes'),
    readBackendConfig('job_filter_conditions'),
    readBackendConfig('industry_filter_exemptions'),
    readBackendConfig('city_groups')
  ])
  return {
    config: {
      'boss.json': boss,
      'dingtalk.json': dingtalk,
      'target-company-list.json': targetCompanies,
      'llm.json': llm,
      'common-job-condition-config.json': jobIntention,
      'resumes.json': resumes,
      'job-filter-conditions': filterConditions,
      'industry-filter-exemptions': industryFilterExemptions,
      'city-groups': cityGroups
    }
  }
}

async function saveLegacyConfig(payload: string) {
  const value = JSON.parse(payload) as Record<string, unknown>
  const { expectCompanies, dingtalkRobotAccessToken, ...bossPatch } = value
  delete bossPatch.expectJobRegExpStr
  const writes: Array<Promise<unknown>> = [writeBackendConfig('opening_message', bossPatch)]
  if (dingtalkRobotAccessToken !== undefined) {
    writes.push(
      writeBackendConfig('notification_config', { groupRobotAccessToken: dingtalkRobotAccessToken })
    )
  }
  if (expectCompanies !== undefined) {
    writes.push(writeBackendConfig('target_companies', String(expectCompanies).split(',')))
  }
  return await Promise.all(writes)
}

async function listRendererRecords<T>(
  resource: string,
  payload: { pageNo?: number; pageSize?: number } = {}
): Promise<PageResult<T>> {
  return await listBackendRecords<T>(resource, {
    page: payload.pageNo ?? 1,
    pageSize: payload.pageSize ?? 10
  })
}

export function registerBackendIpc(): void {
  ipcMain.handle('fetch-config-file-content', fetchLegacyConfigFiles)
  ipcMain.handle('save-config-file-from-ui', (_event, payload) => saveLegacyConfig(payload))
  ipcMain.handle(
    'check-boss-zhipin-cookie-file',
    async () => (await readBackendConfig<{ configured: boolean }>('boss_cookies')).configured
  )
  ipcMain.handle('get-auto-start-chat-record', (_event, payload) =>
    listRendererRecords('autoStartChats', payload)
  )
  ipcMain.handle('get-mark-as-not-suit-record', (_event, payload) =>
    listRendererRecords('markAsNotSuit', payload)
  )
  ipcMain.handle('get-job-library', (_event, payload) => listRendererRecords('jobs', payload))
  ipcMain.handle('get-boss-library', (_event, payload) => listRendererRecords('bosses', payload))
  ipcMain.handle('get-company-library', (_event, payload) =>
    listRendererRecords('companies', payload)
  )
  ipcMain.handle(
    'get-job-history-by-encrypt-id',
    async (_event, encryptJobId) =>
      (
        await listBackendRecords('jobHistory', {
          page: 1,
          pageSize: 100,
          filters: { encryptJobId }
        })
      ).items
  )
}
