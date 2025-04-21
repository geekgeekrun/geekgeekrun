<template>
  <div class="h100vh flex flex-col">
    <div
      :style="{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: `auto`,
        margin: `0 auto`,
        alignItems: `flex-end`
      }"
    >
      <div class="pb20px"></div>
      <div v-for="(item, index) in messageList" :key="index" class="message-item">
        {{ item.text }}
      </div>
      <div class="pb20px"></div>
    </div>
    <div
      :style="{
        display: 'grid',
        gridTemplateColumns: '100px 1fr',
        height: `fit-content`,
        paddingTop: `10px`,
        paddingBottom: `10px`,
        backgroundColor: `#f0f0f0`
      }"
    >
      <!-- <el-select v-model="selectedLlmConfig">
        <el-option v-for="(it, index) in llmConfigList" :key="index" :label="it">
          <div>{{ it.model }}</div>
          <div>{{ it.providerCompleteApiUrl }}</div>
        </el-option>
      </el-select> -->
      <el-button ml20px type="text" @click="closeWindow">关闭对话框</el-button>
      <el-button
        :loading="isLoading"
        mr10px
        width-fit-content
        type="primary"
        @click="sendLlmGeneratedContent"
      >
        <template v-if="isLoading">正在生成消息，请稍候...</template>
        <template v-else-if="!messageList.length">发送开场白</template>
        <template v-else>发送下一句提醒内容</template>
      </el-button>
      <div></div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
type MessageItem = {
  text: string
  generatedBy: string
}
const messageList = ref<MessageItem[]>([])

// const llmConfigList = ref([])
// async function getLlmConfigList() {
//   debugger
//   llmConfigList.value = await electron.ipcRenderer.invoke('get-llm-config-for-test')
// }
// getLlmConfigList().catch(() => {})
// const selectedLlmConfig = ref()

const isLoading = ref(false)
async function sendLlmGeneratedContent() {
  isLoading.value = true
  try {
    const response = await electron.ipcRenderer.invoke('request-llm-for-test', {
      messageList: JSON.parse(JSON.stringify(messageList.value ?? []))
    })
    console.log(response)
    messageList.value.push({
      text: response.responseText,
      generatedBy: response.usedLlmConfig
    })
  } finally {
    isLoading.value = false
  }
}

function closeWindow() {
  electron.ipcRenderer.send(`close-read-no-reply-reminder-llm-mock-window`)
}
</script>

<style lang="scss" scoped>
.message-item {
  line-height: 1.25em;
  font-size: 14px;
  background-color: #d1f0ef;
  color: #333;
  padding: 10px;
  border-radius: 8px 8px 0 8px;
  margin-top: 20px;
  max-width: 420px;
}
</style>
