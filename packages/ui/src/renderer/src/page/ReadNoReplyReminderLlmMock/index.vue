<template>
  <div class="h100vh flex flex-col">
    <div
      ref="scrollElRef"
      :style="{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: `auto`,
        margin: `0 auto`,
        alignItems: `flex-end`,
        width: '100%'
      }"
    >
      <div
        v-if="messageList.length"
        :style="{
          width: '480px',
          margin: '0 auto'
        }"
      >
        <div class="pb20px"></div>
        <div v-for="(item, index) in messageList" :key="index" flex flex-col flex-items-end>
          <div class="message-item-wrap flex flex-col">
            <div
              class="message-item"
              :class="{
                'will-enter-context': getIsEnterContent(index)
              }"
            >
              {{ item.text }}
            </div>
            <div
              :style="{
                width: 'fit-content',
                alignSelf: 'flex-end'
              }"
              font-size-10px
            >
              {{ item.usedLlmConfig.model }}
            </div>
            <div
              v-if="item?.usedLlmConfig?.providerCompleteApiUrl?.trim()"
              :style="{
                width: 'fit-content',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                alignSelf: 'flex-end',
                color: '#bbb'
              }"
              font-size-10px
              w-fit-content
              max-w-20em
            >
              {{ item.usedLlmConfig.providerCompleteApiUrl }}
            </div>
          </div>
        </div>
        <div class="pb20px"></div>
      </div>
      <div v-else w-full h-full flex flex-item-center justify-center>
        <el-empty>
          <template #description>
            <template v-if="!isLoading">
              点击下方 “<el-button
                font-size-16px
                h-fit-content
                align-baseline
                p0
                type="text"
                @click.prevent="sendLlmGeneratedContent"
                >发送开场白</el-button
              >” 以开始模拟聊天
            </template>
            <template v-else>请稍候，第一条消息正在回复的路上~</template>
          </template>
        </el-empty>
      </div>
    </div>
    <div
      :style="{
        display: 'grid',
        gridTemplateColumns: 'min-content 1fr min-content',
        height: `fit-content`,
        paddingTop: `10px`,
        paddingBottom: `10px`,
        backgroundColor: `#f0f0f0`
      }"
    >
      <el-select v-model="selectedLlmConfig" ml10px w160px placeholder="随机使用一个模型">
        <el-option
          v-for="(it, index) in llmConfigListForRender"
          :key="index"
          :value="it.id"
          :label="it.model"
          :disabled="!it.enabled"
          :style="{
            paddingTop: '10px',
            paddingBottom: '10px',
            height: 'auto',
            lineHeight: '1.25em'
          }"
        >
          <div
            :style="{
              display: 'flex',
              justifyContent: 'space-between'
            }"
          >
            <div>{{ it.model }}</div>
            <div class="font-size-12px color-#bbb">
              {{ formatApiSecret(it.providerApiSecret) || '' }}
            </div>
          </div>
          <div
            v-if="it?.providerCompleteApiUrl?.trim?.()"
            :style="{
              color: '#bbb',
              width: '35em',
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }"
          >
            {{ it.providerCompleteApiUrl }}
          </div>
        </el-option>
      </el-select>
      <el-button
        :loading="isLoading"
        width-fit-content
        type="primary"
        @click="sendLlmGeneratedContent"
      >
        <template v-if="isLoading">正在生成消息，请稍候...</template>
        <template v-else-if="!messageList.length">发送开场白</template>
        <template v-else>发送下一句提醒内容</template>
      </el-button>
      <el-button mr10px type="text" @click="closeWindow">关闭对话框</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { ElMessage } from 'element-plus'
type MessageItem = {
  text: string
  usedLlmConfig: string
  // recordInfo: any
}
const messageList = ref<MessageItem[]>([])

const recentMessageQuantityForLlm =
  Number(new URL(location.href).searchParams.get('recentMessageQuantityForLlm')) || 8
function getIsEnterContent(index) {
  return messageList.value.length - index - 1 < recentMessageQuantityForLlm
}

const llmConfigList = ref([])
const llmConfigListForRender = computed(() => {
  return [
    {
      id: null,
      model: '随机使用一个模型',
      providerCompleteApiUrl: null,
      enabled: true
    },
    ...(llmConfigList.value ?? [])
  ]
})
async function getLlmConfigList() {
  llmConfigList.value = await electron.ipcRenderer.invoke('get-llm-config-for-test')
}
getLlmConfigList().catch(() => {})
const selectedLlmConfig = ref(null)

const scrollElRef = ref(null)
const isLoading = ref(false)
async function sendLlmGeneratedContent() {
  isLoading.value = true
  try {
    const response = await electron.ipcRenderer.invoke('request-llm-for-test', {
      messageList: JSON.parse(JSON.stringify((messageList.value ?? []).slice(-8))),
      llmConfigIdForPick: selectedLlmConfig.value ? [selectedLlmConfig.value] : null
    })
    console.log(response)
    messageList.value.push({
      text: response.responseText,
      usedLlmConfig: response.usedLlmConfig
    })
    await sleep(50)
    ;(scrollElRef.value as any as HTMLDivElement)?.scrollTo({
      top: scrollElRef.value?.scrollHeight,
      behavior: 'smooth'
    })
  } catch (err) {
    ElMessage.error({
      dangerouslyUseHTMLString: true,
      grouping: true,
      message: `<div>本次测试所使用的模型不可用</div><div style="margin-top: 10px; white-space: nowrap;">建议在大语言模型配置中关闭相关模型</div>`
    })
  } finally {
    isLoading.value = false
  }
}

function closeWindow() {
  electron.ipcRenderer.send(`close-read-no-reply-reminder-llm-mock-window`)
}

function formatApiSecret(text) {
  if (typeof text !== 'string' || !text?.trim()) {
    return ''
  }
  if (text === 'ollama') {
    return text
  }
  if (text.length >= 8) {
    return `${text.slice(0, 4)}***${text.slice(-4)}`
  }
  return `***`
}
</script>

<style lang="scss" scoped>
.message-item-wrap {
  max-width: 420px;
  margin-top: 20px;
  .message-item {
    line-height: 1.25em;
    font-size: 14px;
    background-color: #d1f0ef;
    color: #333;
    padding: 10px;
    border-radius: 8px 8px 0 0;
    &.will-enter-context {
      position: relative;
      &::before {
        content: '聊天上下文';
        display: flex;
        font-size: 10px;
        position: absolute;
        top: 100%;
        left: 0;
        background-color: #10c7c3;
        color: #fff;
        line-height: 1;
        padding: 2px 4px;
      }
    }
  }
}
</style>
