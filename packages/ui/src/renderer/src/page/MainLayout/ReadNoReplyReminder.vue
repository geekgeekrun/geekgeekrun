<template>
  <div class="form-wrap">
    <el-form
      ref="formRef"
      :rules="formRules"
      :model="formContent.autoReminder"
      label-position="top"
    >
      <el-form-item label="BOSS直聘 Cookie">
        <el-button size="small" type="primary" @click="handleClickLaunchLogin"
          >编辑Cookie</el-button
        >
      </el-form-item>
      <el-form-item class="mb0" label="跟进话术 - 当发现已读不回的Boss时，将要向Boss发出：">
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
      </el-form-item>
      <div class="ml-30px">
        <template
          v-if="
            formContent.autoReminder.rechatContentSource ===
            RECHAT_CONTENT_SOURCE.GEMINI_WITH_CHAT_CONTEXT
          "
        >
          <el-form-item class="mb4px">
            <div>
              <el-button size="small" type="primary" @click="handleClickConfigLlm">
                配置大语言模型
              </el-button>
              <div class="font-size-12px color-#666">
                支持
                <span
                  class="pl6px pr6px pt4px pb2px color-white border-rd-full font-size-0.8em"
                  style="background-color: #3c4efd"
                  >DeepSeek-V3</span
                >
                <span
                  class="ml4px pl6px pr6px pt4px pb2px color-white border-rd-full font-size-0.8em"
                  style="background-color: #000000"
                  >GPT-4o mini</span
                >
                <span
                  class="ml4px pl6px pr6px pt4px pb2px color-white border-rd-full font-size-0.8em"
                  style="background-color: #462ac4"
                  >Qwen2.5</span
                >
                模型；支持多个“服务商-模型”组合按权重搭配使用
              </div>
            </div>
          </el-form-item>
          <el-form-item class="mb4px">
            <div>
              <el-button size="small" type="primary" @click="handleClickEditResume">
                编辑简历
              </el-button>
              <div class="font-size-12px color-#666">
                简历内容将提交给大语言模型，以用于生成已读不回提醒消息；提交内容及生成消息中不会包含期望薪资
              </div>
            </div>
          </el-form-item>
          <el-form-item class="mb4px">
            <div>
              <div>
                <el-button size="small" type="primary" @click="handleClickEditPrompt">
                  使用外部编辑器编辑提示词模板
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  @click="
                    () => {
                      gtagRenderer('reset_template_clicked_in_main_form')
                      restoreDefaultTemplate()
                    }
                  "
                >
                  还原默认提示词模板
                </el-button>
              </div>
              <div class="font-size-12px color-#666">
                对生成效果不够满意？可在此查看、编辑提示词模板。请在模板中需要插入简历的位置插入
                __REPLACE_REAL_RESUME_HERE__
              </div>
            </div>
          </el-form-item>
          <el-form-item prop="recentMessageQuantityForLlm">
            <div>
              携带最近
              <el-input-number
                v-model="formContent.autoReminder.recentMessageQuantityForLlm"
                class="w-120px"
                :min="8"
                :max="20"
                :precision="0"
                :step="1"
              ></el-input-number>
              次聊天内容作为上下文生成新消息
            </div>
          </el-form-item>
        </template>
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
import { dayjs, ElForm, ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { RECHAT_CONTENT_SOURCE } from '../../../../common/enums/auto-start-chat'
import { gtagRenderer } from '@renderer/utils/gtag'

const router = useRouter()
const formContent = ref({
  autoReminder: {
    throttleIntervalMinutes: 10,
    rechatLimitDay: 21,
    rechatContentSource: 1,
    recentMessageQuantityForLlm: 8
  }
})

const enableRechatLimit = computed({
  get() {
    return Boolean(formContent.value.autoReminder?.rechatLimitDay)
  },
  set(val) {
    if (!val) {
      gtagRenderer('rechat_limit_disabled')
      formContent.value.autoReminder.rechatLimitDay = 0
    } else {
      gtagRenderer('rechat_limit_enabled')
      formContent.value.autoReminder.rechatLimitDay = 21
    }
  }
})

electron.ipcRenderer.invoke('fetch-config-file-content').then((res) => {
  const conf = res.config['boss.json']?.autoReminder || {}
  conf.throttleIntervalMinutes = conf.throttleIntervalMinutes ?? 10
  conf.rechatLimitDay = conf.rechatLimitDay ?? 21
  conf.rechatContentSource = conf.rechatContentSource ?? 1
  conf.recentMessageQuantityForLlm =
    typeof conf.recentMessageQuantityForLlm === 'number'
      ? conf.recentMessageQuantityForLlm > 20
        ? 20
        : conf.recentMessageQuantityForLlm < 8
          ? 8
          : parseInt(conf.recentMessageQuantityForLlm)
      : 8
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
  gtagRenderer('run_read_no_reply_reminder_clicked', {
    throttle_interval_minutes: formContent.value.autoReminder.throttleIntervalMinutes,
    rechat_limit_day: formContent.value.autoReminder.rechatLimitDay,
    rechat_content_source: formContent.value.autoReminder.rechatContentSource,
    recent_message_quantity_for_llm: formContent.value.autoReminder.recentMessageQuantityForLlm
  })
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))
  gtagRenderer('config_saved')
  try {
    await electron.ipcRenderer.invoke('check-if-auto-remind-prompt-valid')
  } catch (err) {
    if (err?.message?.includes(`RESUME_PLACEHOLDER_NOT_EXIST`)) {
      gtagRenderer('cannot_launch_due_to_resume_placeholder_not_exist')
      console.log(`提示词模板无效`, err)
      ElMessageBox.confirm(
        '提示词模板缺少简历内容占位符：<br /><b>__REPLACE_REAL_RESUME_HERE__</b><br /><br />您是否希望还原默认的提示词模板？',
        '',
        {
          confirmButtonText: '是',
          cancelButtonText: '否',
          type: 'warning',
          closeOnClickModal: false,
          dangerouslyUseHTMLString: true
        }
      )
        .then(async () => {
          gtagRenderer('reset_template_clicked_in_invalid_tip_dialog')
          await restoreDefaultTemplate()
        })
        .catch(() => {
          gtagRenderer('close_invalid_tip_dialog')
        })
    } else {
      gtagRenderer('cannot_launch_due_to_unknown_error', { err })
      ElMessage({
        type: 'error',
        message: '用于生成自动提醒消息的提示词检查未通过，请重试'
      })
    }
    return
  }
  if (!(await electron.ipcRenderer.invoke('resume-content-enough-detect'))) {
    gtagRenderer('resume_content_not_enough_dialog_show')
    try {
      await ElMessageBox.confirm(
        `简历内容可能不够充足（各个部分内容长度相加 <800 字）<br />后续大模型根据简历生成的内容将可能不够随机<br /><br />要继续运行吗？`,
        {
          cancelButtonText: '不，我再看看',
          confirmButtonText: '是的，继续运行',
          dangerouslyUseHTMLString: true
        }
      )
    } catch {
      return
    }
  }
  gtagRenderer('reminder_launched')
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

const restoreDefaultTemplate = async () => {
  await electron.ipcRenderer.invoke('overwrite-auto-remind-prompt-with-default')
  ElMessage({
    type: 'success',
    message: '模板还原成功'
  })
}

const handleClickLaunchLogin = () => {
  gtagRenderer('launch_login_clicked')
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
  gtagRenderer('config_llm_clicked')
  try {
    await electron.ipcRenderer.invoke('llm-config')
  } catch (err) {
    console.log(err)
  }
}

const handleClickEditResume = async () => {
  gtagRenderer('edit_resume_clicked')
  try {
    await electron.ipcRenderer.invoke('resume-edit')
  } catch (err) {
    console.log(err)
  }
}

const handleClickEditPrompt = async () => {
  gtagRenderer('edit_prompt_clicked')
  await electron.ipcRenderer.send('no-reply-reminder-prompt-edit')
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
    padding-top: 8px;
  }
  .last-form-item {
    :deep(.el-form-item__content) {
      margin-top: 0px;
      justify-content: flex-end;
    }
  }
}
</style>
