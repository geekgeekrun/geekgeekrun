<template>
  <div class="form-wrap">
    <el-form ref="formRef" :model="formContent" label-position="top" :rules="formRules">
      <el-form-item
        label="BossZhipin cookies (copy with EditThisCookie Extension from a window which has been logined)"
        prop="bossZhipinCookies"
      >
        <el-input
          v-model="formContent.bossZhipinCookies"
          :autosize="{ minRows: 4 }"
          type="textarea"
        />
      </el-form-item>
      <el-form-item label="Dingtalk robot access token" prop="dingtalkRobotAccessToken">
        <el-input v-model="formContent.dingtalkRobotAccessToken" />
      </el-form-item>
      <el-form-item label="Your Expect Companies (separate with comma)" prop="expectCompanies">
        <el-input
          v-model="formContent.expectCompanies"
          :autosize="{ minRows: 4 }"
          type="textarea"
          @blur="handleExpectCompaniesInputBlur"
        />
      </el-form-item>
      <el-form-item class="last-form-item">
        <el-button @click="handleSave">Just save the configuration</el-button>
        <el-button type="primary" @click="handleSubmit"> I'm ready, geekgeekgo! </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import JSON5 from 'json5'
import { ElForm } from 'element-plus';

const formContent = ref({
  bossZhipinCookies: '',
  dingtalkRobotAccessToken: '',
  expectCompanies: ''
})

electron.ipcRenderer.invoke('fetch-config-file-content').then((res) => {
  console.log(res)
  formContent.value.bossZhipinCookies = JSON.stringify(res['boss.json'].cookies, null, 2)
  formContent.value.dingtalkRobotAccessToken = res['dingtalk.json']['groupRobotAccessToken']
  formContent.value.expectCompanies = res['target-company-list.json'].join(',')
})

const formRules = {
  bossZhipinCookies: [
    {
      required: true,
    },
    {
      trigger: 'blur',
      validator (rule, val, cb) {
        try {
          JSON5.parse(val)
        } catch (err) {
          cb(new Error(`JSON content is invalid: ${err.message}`))
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
}
const handleSave = async () => {
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))
  window.alert('Configuration saved.')
}

const handleExpectCompaniesInputBlur = (event) => {
  event.target.value = (event.target?.value ?? '').split(/,|，/).map(it => it.trim()).filter(Boolean).join(',')
}
</script>

<style scoped lang="scss">
.form-wrap {
  --monospace-font-family: Monaco, Consolas, Menlo, monospace;
  padding-top: 100px;
  margin: 0 auto;
  max-width: 640px;
  .last-form-item {
    :deep(.el-form-item__content) {
      margin-top: 40px;
      justify-content: flex-end;
    }
  }

  font-family: var(--monospace-font-family);
  button, input, textarea {
    font-family: var(--monospace-font-family);
  }
}
</style>
