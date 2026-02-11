<template>
  <div class="h-screen of-hidden flex flex-col flex-items-center flex-justify-center">
    <div>
      <div>
        由于您是首次使用本程序，或者您之前配置的浏览器被卸载/被删除/被移动/被更新/版本太旧，因此需要重新配置浏览器
      </div>
      <div>
        首先将尝试自动配置；自动配置成功后，本对话框将自动关闭；如自动配置失败，请在下个页面中手动配置
      </div>
      <div>正在尝试自动配置，请稍等...</div>
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
