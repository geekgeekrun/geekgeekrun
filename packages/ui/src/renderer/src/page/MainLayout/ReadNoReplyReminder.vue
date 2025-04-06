<template>
  <div class="form-wrap">
    <el-form
      ref="formRef"
      :rules="formRules"
      :model="formContent.autoReminder"
      label-position="top"
    >
      <el-form-item>
        <div>
          <div>BOSS直聘 Cookie</div>
          <el-button size="small" type="primary" @click="handleClickLaunchLogin"
            >编辑Cookie</el-button
          >
        </div>
      </el-form-item>
      <el-form-item class="mb-0">
        <div>
          <div>跟进话术 - 当发现已读不回的Boss时，将要向Boss发出：</div>
          <el-radio-group v-model="formContent.autoReminder.rechatContentSource">
            <div>
              <el-radio :label="RECHAT_CONTENT_SOURCE.LOOK_FORWARD_EMOTION">
                “[盼回复]” 表情
              </el-radio>
              <br />
              <el-radio :label="RECHAT_CONTENT_SOURCE.GEMINI_WITH_CHAT_CONTEXT">
                由大语言模型（根据简历及当前聊天上下文）生成的内容
              </el-radio>
            </div>
          </el-radio-group>
        </div>
      </el-form-item>
      <div class="ml-30px">
        <template
          v-if="
            formContent.autoReminder.rechatContentSource ===
            RECHAT_CONTENT_SOURCE.GEMINI_WITH_CHAT_CONTEXT
          "
        >
          <el-form-item prop="geminiApiKey">
            <div class="flex flex-items-center">
              <el-button size="small" type="primary" @click="handleClickConfigLlm">
                配置大语言模型
              </el-button>
              <div class="ml1em">
                支持
                <span
                  class="pl10px pr10px color-white border-rd-full"
                  style="background-color: #3c4efd"
                  >DeepSeek-V3</span
                >
                模型
              </div>
            </div>
          </el-form-item>
        </template>
        <!-- <el-form-item
          v-if="
            formContent.autoReminder.rechatContentSource ===
            RECHAT_CONTENT_SOURCE.GEMINI_WITH_CHAT_CONTEXT
          "
          prop="geminiApiKey"
        >
          <div class="flex">
            Gemini API 密钥&nbsp;<el-button type="text" @click.prevent="goToGeminiNanoApiKeyPage">
            没有密钥？点击此处申请一个
            </el-button>
          </div>
          <el-input v-model="formContent.autoReminder.geminiApiKey" />
        </el-form-item>
        <el-form-item
          v-if="
            formContent.autoReminder.rechatContentSource ===
            RECHAT_CONTENT_SOURCE.GEMINI_WITH_CHAT_CONTEXT
          "
          prop="resumeAbstract"
        >
          <div class="w-full">
            <div class="flex">简历、求职期望摘要&nbsp;<el-button type="text">例子</el-button></div>
            <el-input type="textarea" v-model="formContent.autoReminder.resumeAbstract" />
          </div>
          <el-button class="mt-8px">预览Prompt</el-button>
        </el-form-item> -->
      </div>
      <el-form-item label="跟进间隔（分钟）" prop="throttleIntervalMinutes">
        <el-input-number
          v-model="formContent.autoReminder.throttleIntervalMinutes"
          class="w-150px"
          :min="3"
          :precision="1"
          :step="0.5"
          @blur="handleThrottleIntervalMinutesBlur"
        />&nbsp;分钟内不多次跟进同一Boss
      </el-form-item>
      <el-form-item label="跟进时限（天）" prop="rechatLimitDay">
        <div>
          <div><el-checkbox v-model="enableRechatLimit" />&nbsp;启用</div>
          <el-input-number
            v-model="formContent.autoReminder.rechatLimitDay"
            class="w-150px"
            :min="0"
            :precision="1"
            :step="0.5"
            :disabled="!enableRechatLimit"
          />&nbsp;天<br />
          <div v-if="enableRechatLimit">
            不再跟进&nbsp;（<span class="text-orange">{{ rechatLimitDateString }}</span
            >）之前列表中没有进展的聊天
          </div>
          <div v-else>这将会跟进列表中所有聊天（<span class="text-orange">不建议</span>）</div>
        </div>
      </el-form-item>
      <el-form-item class="last-form-item">
        <el-button type="primary" @click="handleSubmit">开始提醒</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { dayjs, ElForm } from 'element-plus'
import { useRouter } from 'vue-router'
import { RECHAT_CONTENT_SOURCE } from '../../../../common/enums/auto-start-chat'
const router = useRouter()
const formContent = ref({
  autoReminder: {
    throttleIntervalMinutes: 10,
    rechatLimitDay: 21,
    geminiApiKey: '',
    rechatContentSource: 1,
    resumeAbstract: ''
  }
})

const enableRechatLimit = computed({
  get() {
    return Boolean(formContent.value.autoReminder?.rechatLimitDay)
  },
  set(val) {
    if (!val) {
      formContent.value.autoReminder.rechatLimitDay = 0
    } else {
      formContent.value.autoReminder.rechatLimitDay = 21
    }
  }
})

electron.ipcRenderer.invoke('fetch-config-file-content').then((res) => {
  const conf = res.config['boss.json']?.autoReminder || {}
  conf.throttleIntervalMinutes = conf.throttleIntervalMinutes ?? 10
  conf.rechatLimitDay = conf.rechatLimitDay ?? 21
  conf.geminiApiKey = conf.geminiApiKey ?? ''
  conf.rechatContentSource = conf.rechatContentSource ?? 1
  conf.resumeAbstract = conf.resumeAbstract ?? ''

  formContent.value.autoReminder = conf
})

const formRules = {
  throttleIntervalMinutes: {
    validator(_, value, cb) {
      if (/[^0-9.]/.test(String(value)) || isNaN(parseFloat(value)) || isNaN(Number(value))) {
        cb(new Error(`请输入数字！`))
      } else {
        cb()
      }
    }
  },
  rechatLimitDay: {
    validator(_, value, cb) {
      if (/[^0-9.]/.test(String(value)) || isNaN(parseFloat(value)) || isNaN(Number(value))) {
        cb(new Error(`请输入数字！`))
      } else {
        cb()
      }
    }
  },
  geminiApiKey: {
    required: true,
    message: '请输入 Gemini API Key'
  }
}

const formRef = ref<InstanceType<typeof ElForm>>()
watch(
  () => formContent.value.autoReminder,
  () => {
    nextTick(() => {
      formRef.value?.validate?.()
    })
  },
  {
    immediate: true
  }
)

const handleSubmit = async () => {
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))
  router.replace({
    path: '/geekAutoStartChatWithBoss/prepareRun',
    query: { flow: 'read-no-reply-reminder' }
  })
}
function handleThrottleIntervalMinutesBlur() {
  if (formContent.value.autoReminder.throttleIntervalMinutes < 3) {
    formContent.value.autoReminder.throttleIntervalMinutes = 3
  }
  formContent.value.autoReminder.throttleIntervalMinutes = Number(
    formContent.value.autoReminder.throttleIntervalMinutes
  )
}

const handleClickLaunchLogin = () => {
  router.replace('/cookieAssistant')
}

const currentStamp = ref(new Date())
let timer = 0
function updateCurrentStamp() {
  currentStamp.value = new Date()
  timer = window.setTimeout(updateCurrentStamp, 1000)
}
updateCurrentStamp()
onUnmounted(() => {
  window.clearTimeout(timer)
})

const rechatLimitDateString = computed(() => {
  return dayjs(
    +currentStamp.value - formContent.value.autoReminder.rechatLimitDay * 24 * 60 * 60 * 1000
  ).format('YYYY-MM-DD HH:mm:ss')
})

const handleClickConfigLlm = async () => {
  try {
    await electron.ipcRenderer.invoke('llm-config')
  } catch (err) {
    console.log(err)
  }
}
</script>

<style scoped lang="scss">
.form-wrap {
  margin: 0 auto;
  max-width: 1000px;
  max-height: 100vh;
  overflow: auto;
  padding-left: 20px;
  padding-right: 20px;
  :deep(.el-form) {
    padding-top: 40px;
  }
  .last-form-item {
    :deep(.el-form-item__content) {
      margin-top: 40px;
      justify-content: flex-end;
    }
  }
}
</style>
