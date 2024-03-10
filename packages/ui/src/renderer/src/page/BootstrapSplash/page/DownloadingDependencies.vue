<template>
  <div v-if="!dependenciesStatus.puppeteerExecutableAvailable">
    <div mb14px>正在下载核心组件</div>
    <el-progress
      :percentage="browserDownloadPercentage"
      :format="(n) => `${n.toFixed(1)}%`"
      :stroke-width="10"
    />
  </div>
</template>

<script lang="ts" setup>
import { ref, onUnmounted, PropType } from 'vue'
import { ElMessageBox } from 'element-plus'

const props = defineProps({
  dependenciesStatus: {
    type: Object as PropType<Record<string, boolean>>,
    default: () => ({})
  },
  processWaitee: Object
})

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
  if (!props.dependenciesStatus.puppeteerExecutableAvailable) {
    const p = processDownloadBrowser()
    promiseList.push(p)
    p.then(() => {
      props.dependenciesStatus.puppeteerExecutableAvailable = true
    })
  }

  while (promiseList.length) {
    const p = promiseList.shift()!
    try {
      p.then(() => {
        if (!promiseList.length) {
          props.processWaitee?.resolve?.()
        }
      })
      await p
    } catch {
      await ElMessageBox.confirm('需要重试吗？', '核心组件下载失败', {
        closeOnClickModal: false,
        closeOnPressEscape: false,
        showClose: false,
        type: 'error',
        cancelButtonText: '退出程序'
      })
        .then(() => {
          processTasks()
        })
        .catch(() => {
          // FIXME: should exit app here
          promiseList.length = 0
        })
    }
  }
}

processTasks()
</script>
