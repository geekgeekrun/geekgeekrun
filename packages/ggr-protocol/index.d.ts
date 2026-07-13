export declare const PROTOCOL_VERSION: 1

export declare const METHODS: Readonly<{
  SYSTEM_HANDSHAKE: 'system.handshake'
  SYSTEM_HEALTH: 'system.health'
  TASK_LIST: 'task.list'
  TASK_START: 'task.start'
  TASK_STOP: 'task.stop'
  CONFIG_READ: 'config.read'
  CONFIG_WRITE: 'config.write'
  ACCOUNT_STATUS: 'account.status'
  RECORDS_LIST: 'records.list'
  BROWSER_OPEN_LOGIN: 'browser.openLogin'
  BROWSER_OPEN_BOSS: 'browser.openBoss'
  BROWSER_PREPARE: 'browser.prepare'
  BROWSER_GET_AVAILABLE: 'browser.getAvailable'
  BROWSER_SET_EXECUTABLE: 'browser.setExecutable'
  BROWSER_CANCEL: 'browser.cancel'
  APPROVAL_LIST: 'approval.list'
  APPROVAL_APPROVE: 'approval.approve'
  APPROVAL_REQUIRE_HUMAN: 'approval.requireHuman'
}>

export declare const EVENTS: Readonly<{
  TASK_PROGRESS: 'task.progress'
  TASK_EXITED: 'task.exited'
  APPROVAL_REQUIRED: 'approval.required'
  SYSTEM_STATUS: 'system.status'
}>

export interface HandshakeParams {
  client: string
  clientVersion: string
  protocolVersion: number
}

export interface HandshakeResult {
  backendVersion: string
  protocolMin: number
  protocolMax: number
  capabilities: readonly string[]
  state: 'starting' | 'ready' | 'degraded' | 'stopping'
}

export interface SystemHealthResult {
  ready: boolean
  version: string
  protocolVersion: number
}

export interface TaskSummary {
  workerId: string
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed'
  pid: number | null
  startedAt: string | null
  lastError: string | null
  runRecordId: number
  runtimeStorage: {
    runRecordId: number
    stepStatusMapByStepId: Record<string, {
      runRecordId: number
      step: { id: string, status: string }
    }>
  }
}

export interface PageRequest {
  page: number
  pageSize: number
  filters?: Record<string, unknown>
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface RpcErrorShape {
  code: string
  message: string
  data?: unknown
}

export interface RpcRequest<P = Record<string, unknown>> {
  id: string
  method: string
  params: P
}

export interface RpcResult<R = unknown> {
  id: string
  result: R
}

export interface RpcError {
  id: string
  error: RpcErrorShape
}

export interface RpcEvent<D = unknown> {
  event: string
  data: D
}

export declare function createRequest(
  id: string,
  method: string
): RpcRequest<Record<string, never>>
export declare function createRequest<P extends object>(
  id: string,
  method: string,
  params: P
): RpcRequest<P>
export declare function createResult<R>(id: string, result: R): RpcResult<R>
export declare function createError(
  id: string,
  code: string,
  message: string,
  data?: unknown
): RpcError
export declare function createEvent<D>(event: string, data: D): RpcEvent<D>
export declare function assertHandshake(value: unknown): HandshakeParams
