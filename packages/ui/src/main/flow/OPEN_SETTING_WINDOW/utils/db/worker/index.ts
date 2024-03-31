import 'reflect-metadata'
import { parentPort } from 'node:worker_threads'
import { initDb } from '@geekgeekrun/sqlite-plugin'
import { type DataSource } from 'typeorm'
import { getPublicDbFilePath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { VChatStartupLog } from '@geekgeekrun/sqlite-plugin/dist/entity/VChatStartupLog'
import { measureExecutionTime } from '../../../../../../common/utils/performance'
import { PageReq, PagedRes } from '../../../../../../common/types/pagination'

const dbInitPromise = initDb(getPublicDbFilePath())
let dataSource: DataSource | null = null

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
  async getAutoStartChatRecord({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<
    PagedRes<VChatStartupLog>
  > {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }

    const userRepository = dataSource!.getRepository(VChatStartupLog)!
    const [data, totalItemCount] = await measureExecutionTime(
      userRepository.findAndCount({
        skip: (pageNo - 1) * pageSize,
        take: pageSize
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
  }
}

async function attachMessageHandler() {
  parentPort?.on('message', async (event) => {
    const { _uuid, ...restObj } = event
    const { type } = event

    if (!dataSource) {
      await dbInitPromise
    }
    const result = await payloadHandler[type](restObj)
    parentPort?.postMessage({
      _uuid,
      data: result
    })
  })
}
