import { METHODS } from '@geekgeekrun/ggr-protocol'

export const TASKS = Object.freeze({
  AUTO_CHAT: Object.freeze({
    workerId: 'geekAutoStartWithBossMain',
    label: '自动开聊'
  }),
  READ_NO_REPLY: Object.freeze({
    workerId: 'readNoReplyAutoReminderMain',
    label: '已读不回提醒'
  })
})

const CONFIG_RESOURCES = Object.freeze({
  'boss.json': 'opening_message',
  'common-job-condition-config.json': 'job_intention',
  'target-company-list.json': 'target_companies',
  'llm.json': 'llm_config',
  'dingtalk.json': 'notification_config'
})

function assertClient(client) {
  if (!client || typeof client.request !== 'function') {
    throw new TypeError('client.request is required')
  }
  return client
}

function assertAutoMode(mode) {
  if (mode !== undefined && mode !== 'auto') {
    throw new Error(`Unsupported agent mode: ${mode}`)
  }
}

function resourceForConfigFile(fileName) {
  const resource = CONFIG_RESOURCES[fileName]
  if (!resource) {
    throw new Error(`Unsupported config file: ${fileName}`)
  }
  return resource
}

export function createBackendController({ client } = {}) {
  const backend = assertClient(client)

  async function updateConfig({ fileName, patch } = {}) {
    return backend.request(METHODS.CONFIG_WRITE, {
      resource: resourceForConfigFile(fileName),
      patch
    })
  }

  async function applyConfigPatch(configPatch) {
    if (!configPatch) return []
    if (Array.isArray(configPatch)) return Promise.all(configPatch.map(updateConfig))
    if (typeof configPatch !== 'object') throw new Error('configPatch must be an object or array')
    if ('fileName' in configPatch) return [await updateConfig(configPatch)]
    return Promise.all(Object.entries(configPatch).map(([fileName, patch]) => updateConfig({ fileName, patch })))
  }

  return {
    getStatus() {
      return backend.request(METHODS.SYSTEM_HEALTH, {})
    },
    async start({ headless = true, mode = 'auto', configPatch } = {}) {
      assertAutoMode(mode)
      await applyConfigPatch(configPatch)
      return backend.request(METHODS.TASK_START, {
        workerId: TASKS.AUTO_CHAT.workerId,
        options: { headless: Boolean(headless) }
      })
    },
    stop() {
      return backend.request(METHODS.TASK_STOP, { workerId: TASKS.AUTO_CHAT.workerId })
    },
    updateConfig,
    readAppData({ resource } = {}) {
      return backend.request(METHODS.CONFIG_READ, { resource })
    },
    updateAppData({ resource, patch } = {}) {
      return backend.request(METHODS.CONFIG_WRITE, { resource, patch })
    },
    listAiReplyApprovals({ includeAll = false } = {}) {
      return backend.request(METHODS.APPROVAL_LIST, { includeAll })
    },
    createApprovalRequest(request = {}) {
      return backend.request(METHODS.APPROVAL_CREATE, { request })
    },
    approveAutoReply({ id, reason } = {}) {
      return backend.request(METHODS.APPROVAL_APPROVE, {
        id,
        ...(reason === undefined ? {} : { reason })
      })
    },
    requireHumanIntervention({ id, reason = 'manual handling required' } = {}) {
      return backend.request(METHODS.APPROVAL_REQUIRE_HUMAN, { id, reason })
    }
  }
}
