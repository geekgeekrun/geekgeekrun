<template>
  <div class="form-wrap">
    <el-form ref="formRef" :model="formContent" label-position="top" :rules="formRules">
      <el-form-item label="BOSS直聘 Cookie" prop="bossZhipinCookies">
        <div class="description" font-size-0.8em>
          <div>Cookie 是您访问BOSS直聘聊天功能的凭据。</div>
          <div>
            本程序承诺，<b style="color: #e40">您的Cookie仅在您的PC与BOSS直聘网站之间存储、传递</b
            >，不做其它用途；请放心填写
          </div>
          <!-- <div>操作过程中，本程序缓存的 Boss直聘 Cookie 会被自动更新</div> -->
          <div>
            您可
            <el-button size="small" type="primary" font-size-inherit @click="launchLogin"
              >点击此处打开BOSS直聘登录页</el-button
            >，按照稍后的提示，使用EditThisCookie复制Cookie，并进行粘贴
          </div>
        </div>
        <el-input
          v-model="formContent.bossZhipinCookies"
          :autosize="{ minRows: 4 }"
          type="textarea"
        />
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
import JSON5 from 'json5'
import { ElForm, ElMessage } from 'element-plus'
import router from '../../router/index'
import { mountGlobalDialog as mountDependenciesSetupProgressIndicatorDialog } from '@renderer/features/DependenciesSetupProgressIndicatorDialog/operations'

const formContent = ref({
  bossZhipinCookies: '',
  dingtalkRobotAccessToken: '',
  expectCompanies: ''
})

electron.ipcRenderer.invoke('fetch-config-file-content').then((res) => {
  console.log(res)
  formContent.value.bossZhipinCookies = JSON.stringify(res.storage['boss-cookies.json'], null, 2)
  formContent.value.dingtalkRobotAccessToken = res.config['dingtalk.json']['groupRobotAccessToken']
  formContent.value.expectCompanies = res.config['target-company-list.json'].join(',')
})

const formRules = {
  bossZhipinCookies: [
    {
      required: true
    },
    {
      trigger: 'blur',
      validator(rule, val, cb) {
        let arr
        try {
          arr = JSON5.parse(val)
        } catch (err) {
          cb(new Error(`JSON content is invalid: ${err.message}`))
          return
        }
        if (!Array.isArray(arr) || !arr.length) {
          cb(new Error(`Invalid cookies. Please copy with EditThisCookie extension`))
          return
        }
        cb()
      }
    }
  ]
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
        mountDependenciesSetupProgressIndicatorDialog(checkDependenciesResult)
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

const launchLogin = () => {
  electron.ipcRenderer.send('launch-bosszhipin-login-page-with-preload-extension')
}
</script>

<style scoped lang="scss">
.form-wrap {
  padding-top: 100px;
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
