<template>
  <div class="read-no-reply-auto-reminder__running-status">
    <FlyingCompanyLogoList class="flying-company-logo-list" />
    <div class="tip">
      <article>
        <h1>👋 已读不回复聊正在运行</h1>
        <p>🍀 祝你求职顺利！</p>
      </article>
      <el-button :disabled="isStopping" @click="handleStopButtonClick">停止开聊</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import FlyingCompanyLogoList from '../../features/FlyingCompanyLogoList/index.vue'
import { ElMessage } from 'element-plus'
import { gtagRenderer } from '@renderer/utils/gtag'

const { ipcRenderer } = electron
const router = useRouter()

const handleStopButtonClick = async () => {
  gtagRenderer('rnrr_stop_button_clicked')
  ipcRenderer.invoke('stop-read-no-reply-auto-reminder')
}

const isStopping = ref(false)
const handleStopping = () => {
  gtagRenderer('rnrr_become_stopping')
  isStopping.value = true
}
ipcRenderer.once('read-no-reply-auto-reminder-stopping', handleStopping)

const handleStopped = () => {
  gtagRenderer('rnrr_become_stopped')
  router.replace('/main-layout/ReadNoReplyReminder')
}
ipcRenderer.once('read-no-reply-auto-reminder-stopped', handleStopped)

onUnmounted(() => {
  ipcRenderer.removeListener('read-no-reply-auto-reminder-stopped', handleStopped)
  ipcRenderer.removeListener('read-no-reply-auto-reminder-stopping', handleStopping)
})

onMounted(async () => {
  try {
    await electron.ipcRenderer.invoke('run-read-no-reply-auto-reminder')
  }
  catch (err) {
    if (err instanceof Error && err.message.includes('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')) {
      gtagRenderer('rnrr_cannot_run_for_corrupt')
      ElMessage.error({
        message: `核心组件损坏，正在尝试修复`
      })
      router.replace('/')
    }
    console.error(err)
    gtagRenderer('rnrr_cannot_run_for_unknown_error', { err })
  }
})
</script>

<style scoped lang="scss">
.read-no-reply-auto-reminder__running-status {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  .tip {
    margin: 0 auto;
    margin-top: -15vh;
    max-width: 640px;
  }
  .flying-company-logo-list {
    position: absolute;
    inset: 0;
    z-index: -1;
    opacity: 0.25;
  }
}
</style>
