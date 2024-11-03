<template>
  <div class="form-wrap">
    <el-form ref="formRef" label-position="top" :rules="formRules">
      <el-form-item label="BOSS直聘 Cookie">
        <el-button size="small" type="primary" font-size-inherit @click="handleClickLaunchLogin"
          >编辑Cookie</el-button
        >
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

electron.ipcRenderer.invoke('fetch-config-file-content').then((res) => {})

const formRules = {}

const formRef = ref<InstanceType<typeof ElForm>>()
const handleSubmit = async () => {
  await formRef.value!.validate()
  router.replace({
    path: '/geekAutoStartChatWithBoss/prepareRun',
    query: { flow: 'read-no-reply-reminder' }
  })
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
