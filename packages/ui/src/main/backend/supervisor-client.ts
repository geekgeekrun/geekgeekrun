import { app } from 'electron'
import path from 'node:path'
import { createGgrClient } from '@geekgeekrun/ggr-client'
import { redactDiagnosticText } from './redaction.mjs'

type SupervisorClient = ReturnType<typeof createGgrClient>
type RecordValue = Record<string, unknown>

export type BackendUpdateStatus = {
  current: string | null
  previous: string | null
  candidate: string | null
  progress: string | null
  state: string | null
  rollback: { automatic: boolean; version: string | null; reason: string | null } | null
  lastFailure: { code: string; message: string; candidate: string | null } | null
  diagnostics: Array<{ event: string; level: string; message: string }>
}

let supervisor: SupervisorClient | undefined

export function getSupervisorSocketPath(): string {
  return path.join(app.getPath('home'), '.geekgeekrun', 'run', 'supervisor.sock')
}

export function getSupervisorClient(): SupervisorClient {
  supervisor ??= createGgrClient({
    socketPath: getSupervisorSocketPath(),
    client: 'electron',
    clientVersion: app.getVersion(),
    protocolVersion: 1,
    connectTimeoutMs: 3_000,
    requestTimeoutMs: 125_000
  })
  return supervisor
}

export async function requestSupervisor<T>(method: string, params: RecordValue = {}): Promise<T> {
  const client = getSupervisorClient()
  if (!client.connected) await client.connect()
  return await client.request(method, params) as T
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function cleanMessage(value: unknown): string {
  return redactDiagnosticText(value)
}

function publicLabel(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[a-z0-9._-]{1,80}$/i.test(value) ? value : fallback
}

function publicDiagnostics(value: unknown): BackendUpdateStatus['diagnostics'] {
  if (!Array.isArray(value)) return []
  return value.slice(-20).flatMap((record) => {
    if (!record || typeof record !== 'object') return []
    const item = record as RecordValue
    return [{
      event: publicLabel(item.event, 'diagnostic'),
      level: ['debug', 'info', 'warn', 'error'].includes(String(item.level)) ? String(item.level) : 'info',
      message: cleanMessage(item.message)
    }]
  })
}

function publicStatus(value: unknown, diagnostics: unknown = []): BackendUpdateStatus {
  const status = value && typeof value === 'object' ? value as RecordValue : {}
  const failure = status.lastFailure && typeof status.lastFailure === 'object' ? status.lastFailure as RecordValue : null
  const rollback = status.rollback && typeof status.rollback === 'object' ? status.rollback as RecordValue : null
  return {
    current: stringOrNull(status.current), previous: stringOrNull(status.previous), candidate: stringOrNull(status.candidate),
    progress: stringOrNull(status.progress), state: stringOrNull(status.state),
    rollback: rollback ? { automatic: rollback.automatic === true, version: stringOrNull(rollback.version), reason: cleanMessage(rollback.reason) } : null,
    lastFailure: failure ? { code: stringOrNull(failure.code) ?? 'BACKEND_FAILED', message: cleanMessage(failure.message), candidate: stringOrNull(failure.candidate) } : null,
    diagnostics: publicDiagnostics(diagnostics)
  }
}

export async function getBackendUpdateStatus(): Promise<BackendUpdateStatus> {
  const [status, diagnostics] = await Promise.all([
    requestSupervisor('supervisor.status'),
    requestSupervisor('diagnostics.tail', { limit: 20 }).catch(() => [])
  ])
  return publicStatus(status, diagnostics)
}

export async function checkBackendUpdate(): Promise<{ availableVersion: string | null; compatible: boolean; reason: string | null }> {
  const check = await requestSupervisor<RecordValue | null>('update.check')
  if (!check || typeof check !== 'object') return { availableVersion: null, compatible: true, reason: null }
  return { availableVersion: stringOrNull(check.version), compatible: check.compatible !== false, reason: cleanMessage(check.reason) }
}

export async function installBackendUpdate({ cancelRunningTasks = false }: { cancelRunningTasks?: boolean } = {}): Promise<BackendUpdateStatus> {
  await requestSupervisor('update.install', { deadlineMs: 120_000, cancelRunningTasks })
  return getBackendUpdateStatus()
}

export async function rollbackBackendUpdate(): Promise<BackendUpdateStatus> {
  await requestSupervisor('update.rollback')
  return getBackendUpdateStatus()
}

export function setSupervisorClientForTesting(value: SupervisorClient | undefined): void {
  supervisor = value
}
