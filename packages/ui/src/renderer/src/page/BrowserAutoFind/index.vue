<template>
  <div class="h-screen of-hidden flex flex-col flex-items-center flex-justify-center">
    <div>
      <div>你可能是第一次安装本程序</div>
      <div>正在查找可用浏览器，请稍等...</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'

const { ipcRenderer } = electron
const router = useRouter()
// const checkDependenciesResult = ref({})
// const downloadProcessWaitee = ref(null)

const gtagRenderer = (name, params?: object) => {
  return baseGtagRenderer(name, {
    scene: 'browser-auto-find',
    ...params
  })
}

async function autoDetectPuppeteerExecutable() {
  const result = await ipcRenderer.invoke('get-any-available-puppeteer-executable')
  if (!result) {
    gtagRenderer('first-run-auto-detect-pptr-exe-fail')
    ElMessage({
      message: '未找到可用浏览器的可执行文件，请尝试手动配置',
      type: 'warning',
      grouping: true
    })
    router.replace({
      path: '/browserAssistant',
      query: {
        firstRun: 1
      }
    })
    return
  }
  gtagRenderer('first-run-auto-detect-pptr-exe-success')
  await ipcRenderer.send('browser-config-saved')
}

autoDetectPuppeteerExecutable()
</script>

<style lang="scss" scoped>
a:link,
a:visited,
a:hover,
a:active {
  color: #409eff;
}
</style>
