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
        label="期望职位白名单正则（按照职位名称+职位描述筛选职位，为空时将不按此条件筛选）"
        prop="expectJobRegExpStr"
      >
        <el-input v-model="formContent.expectJobRegExpStr" />
      </el-form-item>
      <el-form-item label="期望公司（以逗号分隔，为空时将不按此条件筛选）" prop="expectCompanies">
        <el-input
          v-model="formContent.expectCompanies"
          :autosize="{ minRows: 4 }"
          type="textarea"
          @blur="normalizeExpectCompanies"
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
            >你开心就好</span
          >
        </div>
      </el-form-item>
      <el-form-item label="标记不合适机制" class="color-orange">
        1. 如果查找到的职位活跃时间为“本月活跃”或更往前的时间，则这个职位将被标记为不合适<br />
        2. 如果查找到的职位，职位名称、职位类型、职位描述与期望职位白名单正则不匹配，则这个职位将被标记为不合适
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
  anyCombineRecommendJobFilter: {},
  expectJobRegExpStr: ''
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
  formContent.value.expectJobRegExpStr = res.config['boss.json']?.expectJobRegExpStr ?? ''
})

const formRules = {
  expectJobRegExpStr: {
    validator(_, value, cb) {
      if (!value) {
        cb()
        return
      }
      try {
        new RegExp(value, 'ig')
        cb()
      } catch (err) {
        cb(new Error(`正则无效：${err.message}`))
      }
    }
  }
}

const formRef = ref<InstanceType<typeof ElForm>>()
const handleSubmit = async () => {
  formContent.value.expectJobRegExpStr = (formContent.value.expectJobRegExpStr || '').trim()
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))

  router.replace({
    path: '/geekAutoStartChatWithBoss/prepareRun',
    query: { flow: 'geek-auto-start-chat-with-boss' }
  })
}
const handleSave = async () => {
  normalizeExpectCompanies()
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))
  ElMessage.success('Configuration saved.')
}

const normalizeExpectCompanies = () => {
  formContent.value.expectCompanies = formContent.value.expectCompanies
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
