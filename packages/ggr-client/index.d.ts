export interface GgrClient {
  connect(): Promise<void>
  request<T = unknown>(method: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<T>
  onEvent(listener: (event: { event: string; data: Record<string, unknown> }) => void): () => void
  close(): Promise<void>
  readonly connected: boolean
}

export function createGgrClient(options: {
  socketPath: string
  client: string
  clientVersion: string
  protocolVersion?: number
  connectTimeoutMs?: number
  requestTimeoutMs?: number
}): GgrClient
