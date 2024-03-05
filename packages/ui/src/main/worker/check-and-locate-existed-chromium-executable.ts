import { parentPort } from 'node:worker_threads'
import findAndLocateExistedChromiumExecutable from '../flow/CHECK_AND_DOWNLOAD_DEPENDENCIES/check-and-locate-existed-chromium-executable'
;(async () => {
  try {
    const result = await findAndLocateExistedChromiumExecutable()
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
