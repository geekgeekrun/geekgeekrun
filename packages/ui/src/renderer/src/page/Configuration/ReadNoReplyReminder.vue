<template>
  <div class="form-wrap">
    <el-form
      ref="formRef"
      :rules="formRules"
      :model="formContent.autoReminder"
      label-position="top"
    >
      <el-form-item label="BOSS直聘 Cookie">
        <el-button size="small" type="primary" font-size-inherit @click="handleClickLaunchLogin"
          >编辑Cookie</el-button
        >
      </el-form-item>
      <el-form-item label="复聊话术" class="color-orange">
        当发现已读不回的Boss时，将向Boss发出“[盼回复]”表情
      </el-form-item>
      <el-form-item label="复聊间隔" prop="throttleIntervalMinutes">
        <el-input
          v-model="formContent.autoReminder.throttleIntervalMinutes"
          class="w-100px"
          min="3"
          @blur="handleThrottleIntervalMinutesBlur"
        />&nbsp;分钟内不向同一Boss多次复聊
      </el-form-item>
      <el-form-item class="last-form-item">
        <el-button type="primary" @click="handleSubmit">开始提醒</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElForm } from 'element-plus'
import { useRouter } from 'vue-router'
const router = useRouter()

const formContent = ref({
  autoReminder: {
    throttleIntervalMinutes: 10
  }
})

electron.ipcRenderer.invoke('fetch-config-file-content').then((res) => {
  formContent.value.autoReminder = res.config['boss.json']?.autoReminder ?? {
    throttleIntervalMinutes: 10
  }
})

const formRules = {
  throttleIntervalMinutes: {
    trigger: 'blur',
    validator (_, value, cb) {
      if (/[^0-9.]/.test(String(value)) || isNaN(parseFloat(value)) || isNaN(Number(value))) {
        cb(new Error(`请输入数字！`))
      } else {
        cb()
      }
    }
  }
}

const formRef = ref<InstanceType<typeof ElForm>>()
const handleSubmit = async () => {
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))
  router.replace({
    path: '/geekAutoStartChatWithBoss/prepareRun',
    query: { flow: 'read-no-reply-reminder' }
  })
}
function handleThrottleIntervalMinutesBlur () {
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
