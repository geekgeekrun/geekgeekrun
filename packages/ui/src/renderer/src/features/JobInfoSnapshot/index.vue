<template>
  <el-form class="form" label-position="top" size="small">
    <el-form-item label="公司">{{ jobInfo.companyName }}</el-form-item>
    <el-form-item label="职位名称">{{ jobInfo.jobName }}</el-form-item>
    <el-form-item label="职位分类">{{ jobInfo.positionName }}</el-form-item>
    <el-form-item v-if="scene === 'startChatRecord'" label="开聊时间">
      {{
        jobInfo.date
          ? transformUtcDateToLocalDate(jobInfo.date).format('YYYY-MM-DD HH:mm:ss')
          : '无记录'
      }}
    </el-form-item>
    <el-form-item v-if="scene === 'markAsNotSuitRecord'" label="标记时间">
      {{
        jobInfo.date
          ? transformUtcDateToLocalDate(jobInfo.date).format('YYYY-MM-DD HH:mm:ss')
          : '无记录'
      }}
    </el-form-item>
    <el-form-item label="工作经验">{{ jobInfo.experienceName }}</el-form-item>
    <el-form-item label="薪资">{{
      `${jobInfo.salaryLow}-${jobInfo.salaryHigh}k` +
      (jobInfo.salaryMonth ? `* ${jobInfo.salaryMonth}薪` : '')
    }}</el-form-item>
    <el-form-item label="职位描述">
      <pre class="of-auto">{{ jobInfo.description }}</pre>
    </el-form-item>
    <el-form-item label="BOSS"
      >{{ jobInfo.bossName
      }}<template v-if="jobInfo.bossTitle"> - {{ jobInfo.bossTitle }}</template></el-form-item
    >
  </el-form>
</template>

<script setup lang="ts">
import { PropType } from 'vue'
import { type VChatStartupLog } from '@geekgeekrun/sqlite-plugin/src/entity/VChatStartupLog'
import { type VMarkAsNotSuitLog } from '@geekgeekrun/sqlite-plugin/src/entity/VMarkAsNotSuitLog'
import { transformUtcDateToLocalDate } from '@geekgeekrun/utils/date.mjs'

defineProps({
  jobInfo: {
    type: Object as PropType<VChatStartupLog | VMarkAsNotSuitLog>,
    required: true
  },
  scene: {
    type: String
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
