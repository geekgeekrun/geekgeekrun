import { initDb } from '@geekgeekrun/sqlite-plugin'
import { AutoStartChatRunRecord } from '@geekgeekrun/sqlite-plugin/dist/entity/AutoStartChatRunRecord.js'
import { JobInfoChangeLog } from '@geekgeekrun/sqlite-plugin/dist/entity/JobInfoChangeLog.js'
import { UserInfo } from '@geekgeekrun/sqlite-plugin/dist/entity/UserInfo.js'
import { VBossLibrary } from '@geekgeekrun/sqlite-plugin/dist/entity/VBossLibrary.js'
import { VChatStartupLog } from '@geekgeekrun/sqlite-plugin/dist/entity/VChatStartupLog.js'
import { VCompanyLibrary } from '@geekgeekrun/sqlite-plugin/dist/entity/VCompanyLibrary.js'
import { VJobLibrary } from '@geekgeekrun/sqlite-plugin/dist/entity/VJobLibrary.js'
import { VMarkAsNotSuitLog } from '@geekgeekrun/sqlite-plugin/dist/entity/VMarkAsNotSuitLog.js'

const invalidParams = (message) => Object.assign(new Error(message), { code: 'INVALID_PARAMS' })
const RESOURCE_MAP = Object.freeze({
  autoStartChatRuns: { entity: AutoStartChatRunRecord, order: { date: 'DESC' }, filters: [] },
  autoStartChats: { entity: VChatStartupLog, order: { date: 'DESC' }, filters: [] },
  markAsNotSuit: { entity: VMarkAsNotSuitLog, order: { date: 'DESC' }, filters: [] },
  jobs: { entity: VJobLibrary, filters: [] },
  companies: { entity: VCompanyLibrary, filters: [] },
  bosses: { entity: VBossLibrary, filters: [] },
  jobHistory: { entity: JobInfoChangeLog, order: { updateTime: 'DESC' }, filters: ['encryptJobId'] }
})

function dto(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item))
}

export function createRecordsService({ dataSource, databaseFile, initDatabase = initDb } = {}) {
  if (!dataSource && !databaseFile) throw new TypeError('dataSource or databaseFile is required')
  let connection = dataSource
  let connectionPromise
  const getConnection = async () => {
    if (connection) return connection
    connectionPromise ??= initDatabase(databaseFile).then((value) => (connection = value))
    return connectionPromise
  }

  async function list({ resource, page = 1, pageSize = 10, filters = {} } = {}) {
    const definition = RESOURCE_MAP[resource]
    if (!definition) throw invalidParams(`Unsupported records resource: ${resource}`)
    if (!Number.isInteger(page) || page < 1) throw invalidParams('page must be a positive integer')
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw invalidParams('pageSize must be an integer between 1 and 100')
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw invalidParams('filters must be an object')
    const unsupported = Object.keys(filters).find((key) => !definition.filters.includes(key))
    if (unsupported) throw invalidParams(`Unsupported filter for ${resource}: ${unsupported}`)
    const where = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined))
    const repository = (await getConnection()).getRepository(definition.entity)
    const [items, total] = await repository.findAndCount({
      skip: (page - 1) * pageSize,
      take: pageSize,
      ...(definition.order ? { order: definition.order } : {}),
      ...(Object.keys(where).length ? { where } : {})
    })
    return { items: dto(items), total, page, pageSize }
  }

  async function accountStatus() {
    const repository = (await getConnection()).getRepository(UserInfo)
    const account = await repository.find({ take: 1 }).then(([value]) => value ?? null)
    return account ? { authenticated: true, account: dto(account) } : { authenticated: false, account: null }
  }

  async function close() {
    const active = connection ?? await connectionPromise
    if (active?.isInitialized) await active.destroy()
    if (!dataSource) {
      connection = undefined
      connectionPromise = undefined
    }
  }

  return { list, accountStatus, close, getDataSource: getConnection }
}
