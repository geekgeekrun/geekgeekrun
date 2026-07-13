import { requestBackend } from '../backend/client'

type TaskSummary = { workerId: string }

export async function runCommon({ mode, headless = process.env.GGR_HEADLESS === 'true' }: { mode: string; headless?: boolean }) {
  const taskList = await requestBackend<TaskSummary[]>('task.list')
  const runningTask = taskList.find((it) => it.workerId === mode)
  if (runningTask) {
    console.log('任务已在运行中')
    return {
      runRecordId: null,
      isAlreadyRunning: true
    }
  }
  await requestBackend('task.start', { workerId: mode, options: { headless } })
  return {
    runRecordId: null,
    isAlreadyRunning: false
  }
}
