<template>
  <el-form class="form" label-position="top" size="small">
    <el-form-item label="公司">{{ jobInfo.companyName }}</el-form-item>
    <el-form-item label="职位名称">{{ jobInfo.jobName }}</el-form-item>
    <el-form-item label="职位分类">{{ jobInfo.positionName }}</el-form-item>
    <el-form-item label="开聊时间">{{
      dayjs(jobInfo.date).format('YYYY-MM-DD HH:mm:ss')
    }}</el-form-item>
    <el-form-item label="工作经验">{{ jobInfo.experienceName }}</el-form-item>
    <el-form-item label="薪资">{{
      `${jobInfo.salaryLow}-${jobInfo.salaryHeight}k` +
      (jobInfo.salaryMonth ? `* ${jobInfo.salaryMonth}薪` : '')
    }}</el-form-item>
    <el-form-item label="职位描述">
      <pre class="of-auto">{{ jobInfo.description }}</pre>
    </el-form-item>
    <el-form-item label="BOSS">{{ jobInfo.bossName }} - {{ jobInfo.bossTitle }}</el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { PropType } from 'vue'
import { type VChatStartupLog } from '@geekgeekrun/sqlite-plugin/src/entity/VChatStartupLog'
import dayjs from 'dayjs'

const props = defineProps({
  jobInfo: {
    type: Object as PropType<VChatStartupLog>,
    required: true
  }
})
</script>

<style lang="scss" scoped>
.form {
  :deep(.el-form-item__label) {
    color: #999;
  }
}
</style>
<style lang="scss"></style>
