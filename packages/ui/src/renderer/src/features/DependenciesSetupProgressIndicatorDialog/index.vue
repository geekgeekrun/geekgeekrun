<template>
  <el-dialog v-bind="$attrs" @open="handleDialogOpen">
    <template v-if="!copiedDependenciesStatus.puppeteerExecutableAvailable">
      <div>Downloading Dedicate Browser</div>
      <el-progress :percentage="browserDownloadPercentage" :format="(n) => `${n.toFixed(1)}%`" />
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, onUnmounted, PropType } from 'vue'
import { ElMessageBox } from 'element-plus'

const props = defineProps({
  dispose: Function,
  dependenciesStatus: {
    type: Object as PropType<Record<string, boolean>>,
    default: () => ({})
  }
})

// shallow copy
const copiedDependenciesStatus = {
  ...props.dependenciesStatus
}

const handleDialogOpen = () => {
  browserDownloadPercentage.value = 0
}

const browserDownloadPercentage = ref(0)
const handleBrowserDownloadProgress = (ev, { downloadedBytes, totalBytes }) => {
  browserDownloadPercentage.value = (downloadedBytes / totalBytes) * 100
}
electron.ipcRenderer.on('PUPPETEER_DOWNLOAD_PROGRESS', handleBrowserDownloadProgress)
onUnmounted(() =>
  electron.ipcRenderer.removeListener('PUPPETEER_DOWNLOAD_PROGRESS', handleBrowserDownloadProgress)
)
const downloadProcessExitCode = ref(0)

const processDownloadBrowser = async () => {
  downloadProcessExitCode.value = 0
  browserDownloadPercentage.value = 0
  try {
    await electron.ipcRenderer.invoke('setup-dependencies')
    browserDownloadPercentage.value = 100
  } catch (err) {
    downloadProcessExitCode.value = 1
    throw err
  }
}

const promiseList: Array<Promise<void>> = []
const processTasks = async () => {
  if (!copiedDependenciesStatus.puppeteerExecutableAvailable) {
    const p = processDownloadBrowser()
    promiseList.push(p)
    p.then(() => {
      copiedDependenciesStatus.puppeteerExecutableAvailable = true
    }).finally(() => {
      const idx = promiseList.indexOf(p)
      idx >= 0 && promiseList.splice(idx, 1)
    })
  }

  while (promiseList.length) {
    try {
      await promiseList[0]
    } catch {
      ElMessageBox.confirm('Encounter error while setup dependencies. Retry?')
        .then(() => {
          processTasks()
        })
        .catch(() => {
          // FIXME: should exit app here
          promiseList.length = 0
          props.dispose?.()
        })
    }
  }
  props.dispose?.()
}

processTasks()
</script>
