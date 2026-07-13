const runRecordIdByWorker = new Map<string, number>()
let nextRunRecordId = Date.now()

export function reserveRunRecordId(workerId: string): number {
  const existing = runRecordIdByWorker.get(workerId)
  if (existing) return existing
  const runRecordId = nextRunRecordId++
  runRecordIdByWorker.set(workerId, runRecordId)
  return runRecordId
}

export function getRunRecordId(workerId: unknown): number | undefined {
  return typeof workerId === 'string' ? runRecordIdByWorker.get(workerId) : undefined
}

export function clearRunRecordId(workerId: unknown): void {
  if (typeof workerId === 'string') runRecordIdByWorker.delete(workerId)
}
