<template>
  <div class="flex flex-col flex-items-start flex-justify-start" v-if="!dependenciesStatus.puppeteerExecutableAvailable">
    <div mb14px>正在下载兼容的浏览器</div>
    <el-progress
      :percentage="browserDownloadPercentage"
      :format="(n) => `${n.toFixed(1)}%`"
      :stroke-width="10"
      class="w400px"
    />
  </div>
</template>

<script lang="ts" setup>
import { ref, onUnmounted, PropType } from 'vue'
import { ElMessageBox } from 'element-plus'
import { gtagRenderer } from '@renderer/utils/gtag'

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
    gtagRenderer('start_download_puppeteer')
    const p = processDownloadBrowser()
    promiseList.push(p)
    p.then(() => {
      gtagRenderer('puppeteer_download_success')
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
      gtagRenderer('encounter_error_when_download_deps')
      await ElMessageBox.confirm('需要重试吗？', '核心组件下载失败', {
        closeOnClickModal: false,
        closeOnPressEscape: false,
        showClose: false,
        type: 'error',
        cancelButtonText: '退出程序'
      })
        .then(() => {
          gtagRenderer('start_retry_download_deps')
          processTasks()
        })
        .catch(() => {
          gtagRenderer('cancel_download_deps_and_exit')
          promiseList.length = 0
          electron.ipcRenderer.invoke('exit-app-immediately')
        })
    }
  }
}

processTasks()
</script>
