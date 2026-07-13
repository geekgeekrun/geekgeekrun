import type { RpcEvent } from '@geekgeekrun/ggr-protocol'
import { EventEmitter } from 'node:events'
import { getBackendClient, onBackendConnected, type BackendClient } from './client'

export const backendEvents = new EventEmitter()

let unsubscribe: (() => void) | undefined
let subscribedClient: BackendClient | undefined
let stopListeningForConnections: (() => void) | undefined

function relay(event: RpcEvent<Record<string, unknown>>): void {
  backendEvents.emit('event', { ...event, data: event.data ?? {} })
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
