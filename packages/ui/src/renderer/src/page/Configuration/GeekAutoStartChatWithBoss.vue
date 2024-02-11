<template>
  <div class="form-wrap">
    <el-form :model="formContent" label-position="top">
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
        />
      </el-form-item>
      <el-form-item class="last-form-item">
        <el-button type="primary"> I'm ready, geekgeekgo! </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const formContent = ref({
  bossZhipinCookies: '',
  dingtalkRobotAccessToken: '',
  expectCompanies: ''
})
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
