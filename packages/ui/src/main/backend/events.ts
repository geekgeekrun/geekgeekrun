import type { RpcEvent } from '@geekgeekrun/ggr-protocol'
import { getBackendClient, onBackendConnected, type BackendClient } from './client'
import { daemonEE } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'

let unsubscribe: (() => void) | undefined
let subscribedClient: BackendClient | undefined
let stopListeningForConnections: (() => void) | undefined

function relay(event: RpcEvent<Record<string, unknown>>): void {
  const data = event.data ?? {}
  switch (event.event) {
    case 'task.progress':
      daemonEE.emit('message', { type: 'worker-to-gui-message', workerId: data.workerId, data })
      break
    case 'task.exited':
      daemonEE.emit('message', { type: 'worker-exited', ...data })
      break
    case 'approval.required':
      daemonEE.emit('message', { type: 'worker-to-gui-message', data: { type: 'approval-required', ...data } })
      break
    case 'system.status':
      daemonEE.emit('message', { type: 'status', workers: data.workers ?? [] })
      break
  }
}

export function registerBackendEvents(backend: BackendClient = getBackendClient()): void {
  if (subscribedClient === backend && unsubscribe) return
  unsubscribe?.()
  subscribedClient = backend
  unsubscribe = backend.onEvent(relay)
}

export function installBackendEventBridge(): void {
  if (stopListeningForConnections) return
  stopListeningForConnections = onBackendConnected(registerBackendEvents)
  const backend = getBackendClient()
  if (backend.connected) registerBackendEvents(backend)
}

export function unregisterBackendEvents(): void {
  unsubscribe?.()
  unsubscribe = undefined
  subscribedClient = undefined
  stopListeningForConnections?.()
  stopListeningForConnections = undefined
}
