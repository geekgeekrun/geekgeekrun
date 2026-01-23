<template>
  <div>
    <p>核心组件下载失败，请重试。</p>
    <br />
    <br />
    <p>
      <b text-orange>提示：</b>由于网络颠簸，如果多次重试仍然失败，请&nbsp;<el-button
        size="small"
        type="primary"
        font-size-14px
        @click="handleOpenChromeDownloadPage"
        >点击此处</el-button
      >&nbsp;下载最新版本 Google Chrome
      浏览器，安装完毕后，重新打开本程序，程序会自动检测该浏览器并使用它。
    </p>
  </div>
</template>

<script lang="ts" setup>
import { gtagRenderer } from '@renderer/utils/gtag'
import debounce from 'lodash/debounce'
const { ipcRenderer } = electron

const handleOpenChromeDownloadPage = debounce(
  async () => {
    gtagRenderer('open_chrome_download_page_clicked')
    ipcRenderer.send('open-external-link', 'https://www.google.cn/chrome/')
  },
  1000,
  { leading: true, trailing: false }
)
</script>

<style scoped></style>
