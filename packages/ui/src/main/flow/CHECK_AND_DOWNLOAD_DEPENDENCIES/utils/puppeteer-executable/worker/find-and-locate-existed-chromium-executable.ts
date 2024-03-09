import { parentPort } from 'node:worker_threads'
import { findAndLocateExistedChromiumExecutableSync } from '../index'
;(async () => {
  try {
    const result = await findAndLocateExistedChromiumExecutableSync()
    parentPort?.postMessage({
      type: 'RESULT',
      data: result
    })
  } catch (error) {
    parentPort?.postMessage({
      type: 'ERROR',
      error
    })
  }

  process.exit(0)
})()
