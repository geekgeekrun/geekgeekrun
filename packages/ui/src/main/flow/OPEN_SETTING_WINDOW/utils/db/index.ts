import createDbWorker from './worker/index?nodeWorker&url'
import { type Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'

let worker: Worker | null = null
let workerExitCode: number | null = null
export const initDbWorker = () => {
  if (!worker || typeof workerExitCode === 'number') {
    worker = createDbWorker()
    workerExitCode = null
    return new Promise((resolve, reject) => {
      worker!.once('exit', (exitCode) => {
        workerExitCode = exitCode
        worker = null
      })
      worker!.on('message', function handler(data) {
        if (data.type === 'DB_INIT_SUCCESS') {
          resolve(worker)
          // attach more event
          worker?.off('message', handler)
        } else if (data.type === 'DB_INIT_FAIL') {
          reject(undefined)
          worker?.terminate()
          worker?.off('message', handler)
          worker = null
        }
      })
    })
  } else {
    return worker
  }
}

const createWorkerPromise = async (data) => {
  await initDbWorker()
  const uuid = randomUUID()
  worker!.postMessage({
    _uuid: uuid,
    ...data
  })
  return new Promise((resolve) => {
    worker!.on('message', function handler(data) {
      const { _uuid, ...payload } = data ?? {}
      if (_uuid === uuid) {
        resolve(payload)
        worker?.off('message', handler)
      }
    })
  })
}

export const getAutoStartChatRecord = async () => {
  const res = await createWorkerPromise({
    type: 'getAutoStartChatRecord'
  })
  return res
}
