import { parentPort } from 'node:worker_threads'
import { initDb } from '@geekgeekrun/sqlite-plugin'
import typeorm from 'typeorm'
import { type DataSource } from 'typeorm'
import { getPublicDbFilePath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

const dbInitPromise = initDb(getPublicDbFilePath())
let dataSource = null

dbInitPromise.then(
  (_dataSource) => {
    dataSource = _dataSource
    attachMessageHandler()
    parentPort?.postMessage({
      type: 'DB_INIT_SUCCESS'
    })
  },
  (error) => {
    parentPort?.postMessage({
      type: 'DB_INIT_FAIL',
      error
    })
    process.exit(1)
  }
)

const payloadHandler = {
  getAutoStartChatRecord(payload, callback) {
    callback({
      x: 'zzzz',
      ...payload
    })
  }
}

async function attachMessageHandler() {
  if (!dataSource) {
    await dbInitPromise
  }
  parentPort?.on('message', (event) => {
    const { _uuid, ...restObj } = event
    const { type } = event

    const callback = (result) => {
      parentPort?.postMessage({
        _uuid,
        data: result
      })
    }

    payloadHandler[type](restObj, callback)
  })
}
