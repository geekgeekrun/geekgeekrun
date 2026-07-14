export const PROTOCOL_VERSION = 1

export const METHODS = Object.freeze({
  SYSTEM_HANDSHAKE: 'system.handshake', SYSTEM_HEALTH: 'system.health', SYSTEM_UPDATE_DRAIN: 'system.updateDrain',
  TASK_LIST: 'task.list', TASK_START: 'task.start', TASK_STOP: 'task.stop',
  CONFIG_READ: 'config.read', CONFIG_WRITE: 'config.write',
  ACCOUNT_STATUS: 'account.status', RECORDS_LIST: 'records.list',
  BROWSER_OPEN_LOGIN: 'browser.openLogin', BROWSER_OPEN_BOSS: 'browser.openBoss', BROWSER_PREPARE: 'browser.prepare',
  BROWSER_GET_AVAILABLE: 'browser.getAvailable', BROWSER_SET_EXECUTABLE: 'browser.setExecutable', BROWSER_CANCEL: 'browser.cancel',
  APPROVAL_LIST: 'approval.list', APPROVAL_CREATE: 'approval.create', APPROVAL_APPROVE: 'approval.approve',
  APPROVAL_REQUIRE_HUMAN: 'approval.requireHuman'
})

export const EVENTS = Object.freeze({
  TASK_PROGRESS: 'task.progress', TASK_EXITED: 'task.exited',
  APPROVAL_REQUIRED: 'approval.required', SYSTEM_STATUS: 'system.status'
})

export const createRequest = (id, method, params = {}) => ({ id, method, params })
export const createResult = (id, result) => ({ id, result })
export const createError = (id, code, message, data) => ({
  id, error: { code, message, ...(data === undefined ? {} : { data }) }
})
export const createEvent = (event, data) => ({ event, data })

export function assertHandshake(value) {
  if (!value || typeof value.client !== 'string' || !value.client ||
      typeof value.clientVersion !== 'string' || !value.clientVersion ||
      !Number.isInteger(value.protocolVersion)) {
    throw new TypeError('client, clientVersion, and integer protocolVersion are required')
  }
  return value
}
