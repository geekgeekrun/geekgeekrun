import type { RpcEvent } from '@geekgeekrun/ggr-protocol'
import { getBackendClient } from './client'
import { daemonEE } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'

let unsubscribe: (() => void) | undefined

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

export function registerBackendEvents(): void {
  if (unsubscribe) return
  unsubscribe = getBackendClient().onEvent(relay)
}

export function unregisterBackendEvents(): void {
  unsubscribe?.()
  unsubscribe = undefined
}
