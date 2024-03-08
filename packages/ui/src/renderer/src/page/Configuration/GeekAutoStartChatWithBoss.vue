<template>
  <div class="form-wrap">
    <el-form ref="formRef" :model="formContent" label-position="top" :rules="formRules">
      <el-form-item label="BOSS直聘 Cookie">
        <el-button size="small" type="primary" font-size-inherit @click="handleClickLaunchLogin"
          >编辑Cookie</el-button
        >
      </el-form-item>
      <el-form-item label="钉钉机器人 AccessToken" prop="dingtalkRobotAccessToken">
        <el-input v-model="formContent.dingtalkRobotAccessToken" />
      </el-form-item>
      <el-form-item label="期望公司（以逗号分隔）" prop="expectCompanies">
        <el-input
          v-model="formContent.expectCompanies"
          :autosize="{ minRows: 4 }"
          type="textarea"
          @blur="handleExpectCompaniesInputBlur"
        />
      </el-form-item>
      <el-form-item class="last-form-item">
        <el-button @click="handleSave">仅保存配置</el-button>
        <el-button type="primary" @click="handleSubmit"> 保存配置，并开始求职！ </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElForm, ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
const router = useRouter()

const formContent = ref({
  dingtalkRobotAccessToken: '',
  expectCompanies: ''
})

electron.ipcRenderer.invoke('fetch-config-file-content').then((res) => {
  console.log(res)
  formContent.value.dingtalkRobotAccessToken = res.config['dingtalk.json']['groupRobotAccessToken']
  formContent.value.expectCompanies = res.config['target-company-list.json'].join(',')
})

const formRules = {
}

const formRef = ref<InstanceType<typeof ElForm>>()
const handleSubmit = async () => {
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))

  try {
    const res = await electron.ipcRenderer.invoke(
      'run-geek-auto-start-chat-with-boss',
      JSON.stringify(formContent.value)
    )

    if (res.type === 'GEEK_AUTO_START_CHAT_WITH_BOSS_STARTED') {
      router.replace('/geekAutoStartChatWithBoss/runningStatus')
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')) {
      ElMessage.error({
        message: `核心组件损坏，正在尝试修复`
      })
      const checkDependenciesResult = await electron.ipcRenderer.invoke('check-dependencies')
      if (Object.values(checkDependenciesResult).includes(false)) {
        router.replace('/')
        // TODO: should continue interrupted task
      }
    }
    console.error(err)
  }
}
const handleSave = async () => {
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))
  ElMessage.success('Configuration saved.')
}

const handleExpectCompaniesInputBlur = (event) => {
  event.target.value = (event.target?.value ?? '')
    .split(/,|，/)
    .map((it) => it.trim())
    .filter(Boolean)
    .join(',')
}

const handleClickLaunchLogin = () => {
  router.replace('/cookieAssistant')
}
</script>

<style scoped lang="scss">
.form-wrap {
  padding-top: 60px;
  margin: 0 auto;
  max-width: 640px;
  .last-form-item {
    :deep(.el-form-item__content) {
      margin-top: 40px;
      justify-content: flex-end;
    }
  }
}
</style>
