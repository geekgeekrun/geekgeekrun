export declare const PROTOCOL_VERSION: 1

export declare const METHODS: Readonly<{
  SYSTEM_HANDSHAKE: 'system.handshake'
  SYSTEM_HEALTH: 'system.health'
  SYSTEM_UPDATE_DRAIN: 'system.updateDrain'
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
  APPROVAL_CREATE: 'approval.create'
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

export interface SystemUpdateDrainParams { enabled: boolean }
export interface SystemUpdateDrainResult { enabled: boolean, activeTasks: TaskSummary[] }

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

export interface JobRecordDto {
  encryptJobId: string | number
  jobName: string
  positionName: string
  salaryLow: number | null
  salaryHigh: number | null
  salaryMonth: number | null
  experienceName: string | number | null
  publishDate: string | null
  degreeName: string
  address?: string
  description: string
  date?: string
  bossName: string
  bossTitle?: string
  companyName: string
}

export interface MarkAsNotSuitRecordDto extends JobRecordDto {
  markReason: number
  extInfo: string
}

export interface JobHistoryRecordDto {
  id: number
  encryptJobId: string | number
  updateTime: string
  dataAsJson: string
}

export interface BossRecordDto {
  encryptBossId: string | number
  name: string
  title: string
  companyName: string | null
  encryptCompanyId: string | number | null
}

export interface CompanyRecordDto {
  encryptCompanyId: string | number
  name: string
  brandName?: string
  scaleLow?: number | null
  scaleHigh?: number | null
  stageName?: string
  industryName?: string
}

export interface FilterOptionDto {
  code: number
  name: string
}

export interface JobFilterConditionsDto {
  salaryList: FilterOptionDto[]
  experienceList: FilterOptionDto[]
  degreeList: FilterOptionDto[]
  scaleList: FilterOptionDto[]
}

export interface IndustryFilterGroupDto {
  code: number
  name: string
  subLevelModelList: FilterOptionDto[]
}

export interface CityDto {
  code: number
  name: string
}

export interface CityGroupDto {
  firstChar: string
  cityList: CityDto[]
}

export interface CityGroupsDto {
  zpData: {
    hotCityList: CityDto[]
    cityGroup: CityGroupDto[]
  }
}

export interface PresentationDataResourcesDto {
  'job-filter-conditions': JobFilterConditionsDto
  'industry-filter-exemptions': IndustryFilterGroupDto[]
  'city-groups': CityGroupsDto
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
