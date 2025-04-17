<template>
  <div class="form-wrap geek-auto-start-run-with-boss">
    <el-form ref="formRef" :model="formContent" label-position="top" :rules="formRules">
      <el-form-item label="BOSS直聘 Cookie">
        <el-button size="small" type="primary" @click="handleClickLaunchLogin"
          >编辑Cookie</el-button
        >
      </el-form-item>
      <!-- <el-form-item
        label="钉钉机器人 AccessToken（用于记录开聊，请勿使用公司内部群）"
        prop="dingtalkRobotAccessToken"
      >
        <el-input v-model="formContent.dingtalkRobotAccessToken" />
      </el-form-item> -->
      <div>
        <el-form-item mb0>
          是否查看职位详情的条件
          <span font-size-12px>（以下条件为空表示不筛选）</span>
          <el-tooltip effect="light" placement="bottom-start" :enterable="false">
            <template #content>
              <img block h-270px src="./resources/intro-of-job-entry.png" />
            </template>
            <div>
              <el-button type="text" font-size-12px ml4px
                ><span><QuestionFilled w-1em h-1em mr2px /></span>期望公司信息位置图示</el-button
              >
            </div>
          </el-tooltip>
        </el-form-item>
        <el-form-item prop="expectCompanies" mb10px>
          <div font-size-12px>期望公司（以逗号分隔）</div>
          <el-input
            v-model="formContent.expectCompanies"
            :autosize="{ minRows: 4 }"
            max-h-6lh
            type="textarea"
            @blur="normalizeExpectCompanies"
          />
        </el-form-item>
      </div>
      <div mb36px>
        <el-form-item mb0>
          查看职位详情后，是发起投递还是标记不合适的条件
          <span font-size-12px>（以下条件为空表示不筛选）</span>
          <el-tooltip effect="light" placement="bottom-start" :enterable="false">
            <template #content>
              <img block h-270px src="./resources/intro-of-job-info.png" />
            </template>
            <div>
              <el-button type="text" font-size-12px ml4px
                ><span><QuestionFilled w-1em h-1em mr2px /></span
                >职位名称/职位类型/职位描述信息位置图示</el-button
              >
            </div>
          </el-tooltip>
        </el-form-item>
        <div
          :style="{
            display: 'grid',
            gridTemplateColumns: '1fr 1em 1fr 1em 1fr',
            gap: '5px',
            width: '100%',
            alignItems: 'end'
          }"
        >
          <el-form-item mb0 prop="expectJobNameRegExpStr">
            <div font-size-12px>职位名称正则（不区分大小写）</div>
            <el-input
              v-model="formContent.expectJobNameRegExpStr"
              @blur="
                formContent.expectJobNameRegExpStr =
                  formContent.expectJobNameRegExpStr?.trim() ?? ''
              "
            />
          </el-form-item>
          <div mb10px font-size-12px flex flex-justify-center>且</div>
          <el-form-item mb0 prop="expectJobTypeRegExpStr">
            <div font-size-12px>职位类型正则（不区分大小写）</div>
            <el-input
              v-model="formContent.expectJobTypeRegExpStr"
              @blur="
                formContent.expectJobTypeRegExpStr =
                  formContent.expectJobTypeRegExpStr?.trim() ?? ''
              "
            />
          </el-form-item>
          <div mb10px font-size-12px flex flex-justify-center>且</div>
          <el-form-item mb0 prop="expectJobDescRegExpStr">
            <div font-size-12px>职位描述正则（不区分大小写）</div>
            <el-input
              v-model="formContent.expectJobDescRegExpStr"
              @blur="
                formContent.expectJobDescRegExpStr =
                  formContent.expectJobDescRegExpStr?.trim() ?? ''
              "
            />
          </el-form-item>
        </div>
      </div>
      <el-form-item pt10px mb10px>
        <div style="--font-size: 12px; font-size: var(--font-size)" line-height-1.5em>
          <div class="color-orange mb4px">标记不合适机制</div>
          <ol m0 line-height-1.5em>
            <li>
              如果查找到的职位，职位名称、职位类型、职位描述与如上正则不匹配，则这个职位将被标记为不合适
            </li>
            <li>如果查找到的职位活跃时间为“本月活跃”或更往前的时间，则这个职位将被标记为不合适</li>
            <li>
              如有错误标记，请在左侧“<a
                href="javascript:void(0)"
                style="color: var(--el-color-primary)"
                @click.prevent="$router.push('/main-layout/MarkAsNotSuitRecord')"
                >标记不合适</a
              >”记录中找到相关记录，手动对这些职位发起会话
            </li>
          </ol>
        </div>
      </el-form-item>
      <el-form-item
        label="职位备选筛选条件（当前求职期望无合适职位时，自动更改Boss筛选条件，查找新工作）"
        prop="filter"
        mb0
      >
        <AnyCombineBossRecommendFilter v-model="formContent.anyCombineRecommendJobFilter" />
        <div>
          当前组合条件数：{{ currentAnyCombineRecommendJobFilterCombinationCount.toLocaleString() }}
          <span
            v-if="currentAnyCombineRecommendJobFilterCombinationCount >= 20"
            class="color-orange"
            >不建议选择太多组合条件</span
          >
        </div>
      </el-form-item>
      <el-form-item class="last-form-item mb0">
        <el-button @click="handleSave">仅保存配置</el-button>
        <el-button type="primary" @click="handleSubmit"> 保存配置，并开始求职！ </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElForm, ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import AnyCombineBossRecommendFilter from '@renderer/features/AnyCombineBossRecommendFilter/index.vue'
import { calculateTotalCombinations } from '@geekgeekrun/geek-auto-start-chat-with-boss/combineCalculator.mjs'
import { gtagRenderer } from '@renderer/utils/gtag'
const router = useRouter()

const formContent = ref({
  dingtalkRobotAccessToken: '',
  expectCompanies: '',
  anyCombineRecommendJobFilter: {},
  expectJobNameRegExpStr: '',
  expectJobTypeRegExpStr: '',
  expectJobDescRegExpStr: ''
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
  //
  if (
    res.config['boss.json']?.expectJobRegExpStr &&
    typeof res.config['boss.json']?.expectJobNameRegExpStr === 'undefined' &&
    typeof res.config['boss.json']?.expectJobTypeRegExpStr === 'undefined' &&
    typeof res.config['boss.json']?.expectJobDescRegExpStr === 'undefined'
  ) {
    res.config['boss.json'].expectJobNameRegExpStr = res.config['boss.json'].expectJobRegExpStr
    res.config['boss.json'].expectJobTypeRegExpStr = res.config['boss.json'].expectJobRegExpStr
    res.config['boss.json'].expectJobDescRegExpStr = res.config['boss.json'].expectJobRegExpStr
  }
  formContent.value.expectJobNameRegExpStr = res.config['boss.json'].expectJobNameRegExpStr?.trim()
  formContent.value.expectJobTypeRegExpStr = res.config['boss.json'].expectJobTypeRegExpStr?.trim()
  formContent.value.expectJobDescRegExpStr = res.config['boss.json'].expectJobDescRegExpStr?.trim()
})

const formRules = {
  expectJobNameRegExpStr: {
    validator(_, value, cb) {
      if (!value) {
        cb()
        gtagRenderer('empty_reg_exp_for_expect_job_name')
        return
      }
      try {
        new RegExp(value, 'ig')
        gtagRenderer('valid_reg_exp_for_expect_job_name')
        cb()
      } catch (err) {
        cb(new Error(`正则无效：${err?.message}`))
        gtagRenderer('invalid_reg_exp_for_expect_job_name')
      }
    }
  },
  expectJobTypeRegExpStr: {
    validator(_, value, cb) {
      if (!value) {
        cb()
        gtagRenderer('empty_reg_exp_for_expect_job_type')
        return
      }
      try {
        new RegExp(value, 'ig')
        gtagRenderer('valid_reg_exp_for_expect_job_type')
        cb()
      } catch (err) {
        cb(new Error(`正则无效：${err?.message}`))
        gtagRenderer('invalid_reg_exp_for_expect_job_type')
      }
    }
  },
  expectJobDescRegExpStr: {
    validator(_, value, cb) {
      if (!value) {
        cb()
        gtagRenderer('empty_reg_exp_for_expect_job_desc')
        return
      }
      try {
        new RegExp(value, 'ig')
        gtagRenderer('valid_reg_exp_for_expect_job_desc')
        cb()
      } catch (err) {
        cb(new Error(`正则无效：${err?.message}`))
        gtagRenderer('invalid_reg_exp_for_expect_job_desc')
      }
    }
  }
}

const formRef = ref<InstanceType<typeof ElForm>>()
const handleSubmit = async () => {
  gtagRenderer('save_config_and_launch_clicked', {
    has_dingtalk_robot_token: !!formContent.value?.dingtalkRobotAccessToken
  })
  formContent.value.expectJobRegExpStr = undefined
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))
  router.replace({
    path: '/geekAutoStartChatWithBoss/prepareRun',
    query: { flow: 'geek-auto-start-chat-with-boss' }
  })
  gtagRenderer('config_saved_and_will_launch_auto_start_chat', {
    has_dingtalk_robot_token: !!formContent.value?.dingtalkRobotAccessToken
  })
}
const handleSave = async () => {
  gtagRenderer('save_config_clicked', {
    has_dingtalk_robot_token: !!formContent.value?.dingtalkRobotAccessToken
  })
  normalizeExpectCompanies()
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))
  ElMessage.success('配置保存成功')
  gtagRenderer('config_saved')
}

const normalizeExpectCompanies = () => {
  formContent.value.expectCompanies = formContent.value.expectCompanies
    .split(/,|，/)
    .map((it) => it.trim())
    .filter(Boolean)
    .join(',')
}

const handleClickLaunchLogin = () => {
  gtagRenderer('launch_login_clicked')
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

<style lang="scss">
.form-wrap.geek-auto-start-run-with-boss {
  .el-form-item__error.el-form-item__error {
    font-size: 12px;
    line-height: 1.2em;
  }
}
</style>
