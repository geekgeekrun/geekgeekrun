import { requestBackend } from '../backend/client'
import { backendEvents } from '../backend/events'
import { reserveRunRecordId } from '../backend/task-correlation'

type TaskSummary = { workerId: string }

export async function runCommon({ mode, headless = process.env.GGR_HEADLESS === 'true' }: { mode: string; headless?: boolean }) {
  const runRecordId = reserveRunRecordId(mode)
  const taskList = await requestBackend<TaskSummary[]>('task.list')
  const runningTask = taskList.find((it) => it.workerId === mode)
  if (runningTask) {
    console.log('任务已在运行中')
    return {
      runRecordId,
      isAlreadyRunning: true
    }
  }
  await requestBackend('task.start', { workerId: mode, options: { headless } })
  backendEvents.emit('event', {
    event: 'task.progress',
    data: {
      workerId: mode,
      runRecordId,
      type: 'prerequisite-step-by-step-check',
      step: { id: 'worker-launch', status: 'fulfilled' }
    }
  })
  return {
    runRecordId,
    isAlreadyRunning: false
  }
}
