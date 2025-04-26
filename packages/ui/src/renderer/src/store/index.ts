import { defineStore } from 'pinia'
import { NewReleaseInfo } from '../../../common/types/update'
import { ref } from 'vue'

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
