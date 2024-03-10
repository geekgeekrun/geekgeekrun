import { parentPort } from 'node:worker_threads'
import { findAndLocateUserInstalledChromiumExecutableSync } from '../index'
;(async () => {
  try {
    const result = await findAndLocateUserInstalledChromiumExecutableSync()
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
