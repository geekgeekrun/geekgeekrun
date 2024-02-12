<template>
  <div class="geek-auto-start-chat-with-boss__running-status">
    <article>
      <h1>Hi buddy!</h1>
      <p>I'm finding your expected job and will start a chat with recruiter.</p>
      <p>You can view the positions you've chatted with in BossZhipin App on your cellphone.</p>
      <p>Good luck to you!</p>
    </article>
    <el-button :disabled="isStopping" @click="handleStop">Stop</el-button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const { ipcRenderer } = electron
const router = useRouter()

const isStopping = ref(false)
const handleStop = async () => {
  ipcRenderer.once('geek-auto-start-chat-with-boss-stopping', () => {
    isStopping.value = true
    ipcRenderer.once('geek-auto-start-chat-with-boss-stopped', () => {
      router.replace('/configuration/GeekAutoStartChatWithBoss')
    })
  })
  ipcRenderer.invoke('stop-geek-auto-start-chat-with-boss')
}
</script>

<style scoped lang="scss"></style>
