import { requestBackend } from '../backend/client'

type TaskSummary = { workerId: string; runRecordId: number }

export async function runCommon({ mode, headless = process.env.GGR_HEADLESS === 'true' }: { mode: string; headless?: boolean }) {
  const taskList = await requestBackend<TaskSummary[]>('task.list')
  const runningTask = taskList.find((it) => it.workerId === mode)
  if (runningTask) {
    console.log('任务已在运行中')
    return {
      runRecordId: runningTask.runRecordId,
      isAlreadyRunning: true
    }
  }
  const startedTask = await requestBackend<TaskSummary>('task.start', { workerId: mode, options: { headless } })
  return {
    runRecordId: startedTask.runRecordId,
    isAlreadyRunning: false
  }
}
