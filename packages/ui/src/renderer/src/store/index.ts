import { defineStore } from 'pinia'
import { NewReleaseInfo } from '../../../common/types/update'
import { ref } from 'vue'
import { throttle } from 'lodash'

export const useUpdateStore = defineStore('update', () => {
  const availableNewRelease = ref<NewReleaseInfo | null>(null)

  async function checkUpdate() {
    let result: NewReleaseInfo | null = null
    try {
      result = (await electron.ipcRenderer.invoke('check-update')) as NewReleaseInfo | null
    } catch {
      //
    }
    availableNewRelease.value = result
  }
  checkUpdate()
  setInterval(checkUpdate, 30 * 30 * 1000)
  return { availableNewRelease }
})

export const useTaskManagerStore = defineStore('taskManager', () => {
  const runningTasks = ref<unknown[]>([])
  function getRunningTasks() {
    const { ipcRenderer } = electron
    ipcRenderer.invoke('get-task-manager-list').then(res => {
      runningTasks.value = res.workers ?? []
    })
  }
  const throttledGetRunningTasks = throttle(getRunningTasks, 2000)
  setInterval(throttledGetRunningTasks, 2 * 1000)
  return { runningTasks, getRunningTasks: throttledGetRunningTasks }
})
