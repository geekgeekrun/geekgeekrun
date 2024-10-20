<template>
  <div class="form-wrap">
    <el-form ref="formRef" :model="formContent" label-position="top" :rules="formRules">
      <el-form-item label="BOSS直聘 Cookie">
        <el-button size="small" type="primary" font-size-inherit @click="handleClickLaunchLogin"
          >编辑Cookie</el-button
        >
      </el-form-item>
      <el-form-item
        label="钉钉机器人 AccessToken（用于记录开聊，请勿使用公司内部群）"
        prop="dingtalkRobotAccessToken"
      >
        <el-input v-model="formContent.dingtalkRobotAccessToken" />
      </el-form-item>
      <el-form-item
        label="期望公司（以逗号分隔，置空即遍历推荐列表，依次开聊）"
        prop="expectCompanies"
      >
        <el-input
          v-model="formContent.expectCompanies"
          :autosize="{ minRows: 4 }"
          type="textarea"
          @blur="handleExpectCompaniesInputBlur"
        />
      </el-form-item>
      <el-form-item
        label="推荐职位筛选器（当前求职期望找不到合适职位时，将尝试所有可能的筛选组合，查找新工作）"
        prop="filter"
      >
        <AnyCombineBossRecommendFilter v-model="formContent.anyCombineRecommendJobFilter" />
        <div>
          当前组合条件数：{{ currentAnyCombineRecommendJobFilterCombinationCount.toLocaleString() }}
          <span
            v-if="
              currentAnyCombineRecommendJobFilterCombinationCount >= 10 &&
              currentAnyCombineRecommendJobFilterCombinationCount < 100
            "
            class="color-orange"
            >组合条件太多，建议少选择一些</span
          >
          <span
            v-if="currentAnyCombineRecommendJobFilterCombinationCount >= 100"
            class="color-orange"
            >好吧，你开心就好</span
          >
        </div>
      </el-form-item>
      <el-form-item class="last-form-item">
        <el-button @click="handleSave">仅保存配置</el-button>
        <el-button type="primary" @click="handleSubmit"> 保存配置，并开始求职！ </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElForm, ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import AnyCombineBossRecommendFilter from '@renderer/features/AnyCombineBossRecommendFilter/index.vue'
import { calculateTotalCombinations } from '@geekgeekrun/geek-auto-start-chat-with-boss/combineCalculator.mjs'
const router = useRouter()

const formContent = ref({
  dingtalkRobotAccessToken: '',
  expectCompanies: '',
  anyCombineRecommendJobFilter: {}
})

const currentAnyCombineRecommendJobFilterCombinationCount = computed(() => {
  return calculateTotalCombinations(formContent.value.anyCombineRecommendJobFilter)
})

electron.ipcRenderer.invoke('fetch-config-file-content').then((res) => {
  console.log(res)
  formContent.value.dingtalkRobotAccessToken = res.config['dingtalk.json']['groupRobotAccessToken']
  formContent.value.expectCompanies = res.config['target-company-list.json'].join(',')
  formContent.value.anyCombineRecommendJobFilter = res.config['boss.json']
    ?.anyCombineRecommendJobFilter ?? {
    salaryList: [],
    experienceList: [],
    degreeList: [],
    scaleList: [],
    industryList: []
  }
})

const formRules = {}

const formRef = ref<InstanceType<typeof ElForm>>()
const handleSubmit = async () => {
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))

  router.replace('/geekAutoStartChatWithBoss/prepareRun')
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
  margin: 0 auto;
  max-width: 1000px;
  max-height: 100vh;
  overflow: auto;
  padding-left: 20px;
  padding-right: 20px;
  :deep(.el-form) {
    padding-top: 60px;
  }
  .last-form-item {
    :deep(.el-form-item__content) {
      margin-top: 40px;
      justify-content: flex-end;
    }
  }
}
</style>
