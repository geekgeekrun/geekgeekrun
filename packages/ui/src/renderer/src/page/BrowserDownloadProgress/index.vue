<template>
  <!-- flex-items- -->
  <div class="flex flex-col flex-justify-center w500px h-full ml-auto mr-auto">
    <div font-size-14px>正在下载 Google Chrome for Testing {{ EXPECT_CHROMIUM_BUILD_ID }}</div>
    <el-progress
      :percentage="browserDownloadPercentage"
      :format="(n) => `${n.toFixed(1)}%`"
      :stroke-width="10"
      class="w500px"
      mt10px
    />
    <div mt10px>
      <el-button @click="handleCancelDownload">取消下载</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onUnmounted, h } from 'vue'
import { ElMessageBox } from 'element-plus'
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import FailMessage from './FailMessage.vue'
import { EXPECT_CHROMIUM_BUILD_ID } from '../../../../common/constant'

const gtagRenderer = (name, params?: object) => {
  return baseGtagRenderer(name, {
    scene: 'browser-download-progress',
    ...params
  })
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

let executablePath
const processDownloadBrowser = async () => {
  downloadProcessExitCode.value = 0
  browserDownloadPercentage.value = 0
  let restRetriedTime = 2
  while (restRetriedTime > 0) {
    try {
      try {
        executablePath = await electron.ipcRenderer.invoke('setup-dependencies')
        browserDownloadPercentage.value = 100
      } catch (err) {
        downloadProcessExitCode.value = 1
        throw err
      }
      break
    } catch (err) {
      restRetriedTime--
      if (restRetriedTime === 0) {
        throw err
      }
      await sleep(5000)
    }
  }
}

const processTasks = async () => {
  try {
    await processDownloadBrowser()
    electron.ipcRenderer.send('browser-download-done', executablePath)
    gtagRenderer('download_deps_done')
  } catch (err) {
    gtagRenderer('encounter_error_when_download_deps')
    await ElMessageBox.confirm(h(FailMessage), {
      closeOnClickModal: false,
      closeOnPressEscape: false,
      showClose: false,
      type: 'error',
      cancelButtonText: '取消',
      confirmButtonText: '重试'
    })
      .then(() => {
        gtagRenderer('start_retry_download_deps')
        processTasks()
      })
      .catch(() => {
        gtagRenderer('cancel_download_deps_from_err_dialog')
        window.close()
      })
  }
}

processTasks()

function handleCancelDownload() {
  gtagRenderer('cancel_download_deps_from_cancel_btn')
  window.close()
}
</script>
