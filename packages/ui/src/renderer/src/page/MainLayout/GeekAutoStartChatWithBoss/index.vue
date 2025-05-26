<template>
  <div
    :style="{
      display: 'flex',
      flexDirection: 'column'
    }"
  >
    <div class="form-wrap geek-auto-start-run-with-boss">
      <el-form ref="formRef" :model="formContent" label-position="top" :rules="formRules">
        <el-card class="config-section">
          <el-form-item mb0>
            <div>
              <div font-size-16px>BOSS直聘 Cookie</div>
              <el-button size="small" type="primary" @click="handleClickLaunchLogin"
                >编辑Cookie</el-button
              >
            </div>
          </el-form-item>
        </el-card>
        <!-- <el-form-item
          label="钉钉机器人 AccessToken（用于记录开聊，请勿使用公司内部群）"
          prop="dingtalkRobotAccessToken"
        >
          <el-input v-model="formContent.dingtalkRobotAccessToken" />
        </el-form-item> -->
        <el-card class="config-section">
          <el-form-item mb0>
            <div font-size-16px>职位列表筛选条件</div>
          </el-form-item>
          <el-form-item prop="expectCompanies" mb0>
            <div
              font-size-14px
              flex
              :style="{
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%'
              }"
            >
              <div>
                期望公司白名单（以逗号分隔，不区分大小写；输入框留空表示不筛选）<el-tooltip
                  effect="light"
                  placement="bottom-start"
                  @show="gtagRenderer('tooltip_show_about_expect_company_figure')"
                >
                  <template #content>
                    <img block h-270px src="../resources/intro-of-job-entry.png" />
                  </template>
                  <el-button type="text" font-size-12px
                    ><span><QuestionFilled w-1em h-1em mr2px /></span
                    >期望公司信息位置图示</el-button
                  >
                </el-tooltip>
              </div>
              <el-dropdown @command="handleExpectCompanyTemplateClicked">
                <el-button size="small"
                  >期望公司模板 <el-icon class="el-icon--right"><arrow-down /></el-icon
                ></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="item in expectCompanyTemplateList"
                      :key="item.name"
                      :command="item"
                      >{{ item.name }}</el-dropdown-item
                    >
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <el-input
              v-model="formContent.expectCompanies"
              :autosize="{ minRows: 4 }"
              max-h-8lh
              type="textarea"
              @blur="normalizeExpectCompanies"
            />
          </el-form-item>
          <!-- <el-form-item prop="expectSalary" mb10px>
            <div
              font-size-12px
              :style="{
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%'
              }"
            >
              <div>期望薪资范围（以 k 为单位）</div>
              <el-input />
            </div>
          </el-form-item> -->
          <div class="h-1px bg-#f0f0f0" mt16px mb16px />
          <div mt16px>
            <div font-size-14px>期望工作地</div>
            <div
              :style="{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px'
              }"
            >
              <el-form-item prop="expectCityList" mb0>
                <div
                  font-size-12px
                  :style="{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%'
                  }"
                >
                  <city-chooser v-model="formContent.expectCityList" />
                </div>
              </el-form-item>
              <div
                v-if="formContent.expectCityList?.length"
                :style="{
                  backgroundColor: '#f0f0f0',
                  width: '1px'
                }"
              ></div>
              <div
                v-if="formContent.expectCityList?.length"
                prop="expectCityList"
                :style="{
                  flex: 1,
                  minWidth: '400px'
                }"
              >
                <el-form-item
                  mb10px
                  :style="{
                    width: '100%'
                  }"
                >
                  <div font-size-12px>当前职位工作地与期望工作地不匹配时：</div>
                  <el-select
                    v-model="formContent.expectCityNotMatchStrategy"
                    @change="
                      (value) => gtagRenderer('expect_city_not_match_strategy_changed', { value })
                    "
                  >
                    <el-option
                      v-for="op in strategyOptionWhenCurrentJobNotMatch"
                      :key="op.value"
                      :label="op.name"
                      :value="op.value"
                      >{{ op.name }}</el-option
                    >
                  </el-select>
                </el-form-item>
                <el-form-item
                  v-if="
                    [
                      MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                      MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                    ].includes(formContent.expectCityNotMatchStrategy)
                  "
                  mb0
                  :style="{
                    width: '100%'
                  }"
                >
                  <div font-size-12px>标记不合适针对的职位范围：</div>
                  <el-select
                    v-model="formContent.strategyScopeOptionWhenMarkJobCityNotMatch"
                    @change="
                      (value) => gtagRenderer('strategy_scope_option_wmjcnm_changed', { value })
                    "
                  >
                    <el-option
                      v-for="op in strategyScopeOptionWhenMarkJobNotMatch"
                      :key="op.value"
                      :label="op.name"
                      :value="op.value"
                      >{{ op.name }}</el-option
                    >
                  </el-select>
                </el-form-item>
              </div>
            </div>

            <el-tooltip
              effect="light"
              placement="bottom-start"
              @show="gtagRenderer('tooltip_show_about_wrongly_mark_not_suit')"
            >
              <template #content>
                <ul m0 line-height-1.5em w-400px pl2em>
                  <li>
                    如有错误标记，请在左侧“<a
                      href="javascript:void(0)"
                      style="color: var(--el-color-primary)"
                      @click.prevent="
                        () => {
                          gtagRenderer('click_view_mansr_from_boss_b_tooltip')
                          $router.push('/main-layout/MarkAsNotSuitRecord')
                        }
                      "
                      >标记不合适</a
                    >”记录中找到相关记录，来查看职位详情，或手动对这些职位发起会话
                  </li>
                </ul>
              </template>
              <el-button type="text" font-size-12px
                ><span><QuestionFilled w-1em h-1em mr2px /></span
                >职位被错误标记不合适时如何处理？</el-button
              >
            </el-tooltip>
          </div>
        </el-card>
        <el-card class="config-section">
          <el-form-item mb0>
            <div font-size-16px>职位详情筛选条件</div>
          </el-form-item>
          <div>
            <div
              flex
              :style="{
                alignItems: 'center',
                justifyContent: 'space-between'
              }"
            >
              <div font-size-14px>
                期望职位信息
                <el-tooltip
                  effect="light"
                  placement="bottom"
                  @show="gtagRenderer('tooltip_show_about_expect_job_info_figure')"
                >
                  <template #content>
                    <img block h-270px src="../resources/intro-of-job-info.png" />
                  </template>
                  <el-button type="text" font-size-12px
                    ><span><QuestionFilled w-1em h-1em mr2px /></span>如下各信息位置图示</el-button
                  >
                </el-tooltip>
              </div>
              <div>
                <el-dropdown ml20px @command="handleExpectJobFilterTemplateClicked">
                  <el-button size="small"
                    >职位详情筛选模板（按职类区分）
                    <el-icon class="el-icon--right"><arrow-down /></el-icon
                  ></el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="item in expectJobFilterTemplateList"
                        :key="item.name"
                        :command="item"
                        >{{ item.name }}</el-dropdown-item
                      >
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
            <div
              :style="{
                display: 'grid',
                gridTemplateColumns: '1fr 1em 1fr 1em 1fr',
                gap: '5px',
                width: '100%',
                alignItems: 'end'
              }"
              class="job-detail-filter-wrap"
            >
              <el-form-item mb0 prop="expectJobNameRegExpStr">
                <div font-size-12px>职位名称正则（不区分大小写）</div>
                <el-input
                  v-model="formContent.expectJobNameRegExpStr"
                  placeholder="true"
                  @blur="
                    formContent.expectJobNameRegExpStr =
                      formContent.expectJobNameRegExpStr?.trim() ?? ''
                  "
                />
              </el-form-item>
              <div mb10px font-size-12px flex flex-justify-center>且</div>
              <el-form-item mb0 prop="expectJobTypeRegExpStr">
                <div font-size-12px>职位类型正则（推荐填写，不区分大小写）</div>
                <el-input
                  v-model="formContent.expectJobTypeRegExpStr"
                  placeholder="true"
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
                  placeholder="true"
                  @blur="
                    formContent.expectJobDescRegExpStr =
                      formContent.expectJobDescRegExpStr?.trim() ?? ''
                  "
                />
              </el-form-item>
            </div>
            <div class="mt10px lh-2em font-size-12px">当前职位名称/类型/描述不符合投递条件时：</div>
            <div
              :style="{
                display: 'grid',
                gridTemplateColumns: '1.25fr 0.75fr',
                gap: '10px 0',
                width: '100%',
                alignItems: 'end'
              }"
            >
              <el-form-item mb0>
                <el-select
                  v-model="formContent.jobNotMatchStrategy"
                  @change="(value) => gtagRenderer('job_not_match_strategy_changed', { value })"
                >
                  <el-option
                    v-for="op in strategyOptionWhenCurrentJobNotMatch"
                    :key="op.value"
                    :label="op.name"
                    :value="op.value"
                    >{{ op.name }}</el-option
                  >
                </el-select>
              </el-form-item>
              <div />
            </div>
          </div>
          <div class="h-1px bg-#f0f0f0" mt16px mb16px />
          <div mt16px>
            <div mb0 lh-2em font-size-14px>活跃度</div>
            <el-form-item>
              <div font-size-12px>认为职位不活跃的时间范围：</div>
              <el-slider
                v-model="formContent.markAsNotActiveSelectedTimeRange"
                :marks="noActiveDefinitionMarks"
                :max="10"
                :step="1"
                pl50px
                pr50px
                pb30px
                class="no-active-definition-text-slider"
                :format-tooltip="
                  (v) =>
                    typeof noActiveDefinitionMarks[v] === 'string'
                      ? noActiveDefinitionMarks[v]
                      : noActiveDefinitionMarks[v]?.label
                "
                @change="(value) => gtagRenderer('job_not_active_time_range_changed', { value })"
              />
            </el-form-item>
            <div
              :style="{
                display: 'grid',
                gridTemplateColumns: '1.25fr 0.75fr',
                gap: '10px 0',
                width: '100%',
                alignItems: 'end'
              }"
            >
              <el-form-item v-if="formContent.markAsNotActiveSelectedTimeRange > 0" mb0>
                <div font-size-12px>当前职位活跃度在如上范围内（即不活跃）时：</div>
                <el-select
                  v-model="formContent.jobNotActiveStrategy"
                  @change="(value) => gtagRenderer('job_not_active_strategy_changed', { value })"
                >
                  <el-option
                    v-for="op in strategyOptionWhenCurrentJobNotMatch"
                    :key="op.value"
                    :label="op.name"
                    :value="op.value"
                    >{{ op.name }}</el-option
                  >
                </el-select>
              </el-form-item>
            </div>
          </div>
        </el-card>
        <el-card class="config-section">
          <el-form-item prop="filter" mb0>
            <div font-size-16px>
              职位备选筛选条件
              <el-tooltip
                effect="light"
                placement="bottom-start"
                @show="gtagRenderer('tooltip_show_about_wrongly_mark_not_suit')"
              >
                <template #content>
                  <ul m0 line-height-1.5em w-400px pl2em>
                    <li>当前求职期望无合适职位时，自动更改Boss直聘页面上的筛选条件，查找新工作</li>
                  </ul>
                </template>
                <el-button type="text" font-size-12px
                  ><span><QuestionFilled w-1em h-1em mr2px /></span
                  >这个配置是如何工作的？</el-button
                >
              </el-tooltip>
            </div>
            <AnyCombineBossRecommendFilter v-model="formContent.anyCombineRecommendJobFilter" />
            <div font-size-12px>
              当前组合条件数：{{
                currentAnyCombineRecommendJobFilterCombinationCount.toLocaleString()
              }}
              <span
                v-if="currentAnyCombineRecommendJobFilterCombinationCount >= 20"
                class="color-orange"
                >不建议选择太多组合条件</span
              >
            </div>
          </el-form-item>
        </el-card>
      </el-form>
    </div>
    <div class="bg-#f8f8f8 pb10px pt10px">
      <div
        :style="{
          display: 'flex',
          justifyContent: 'end',
          maxWidth: '1000px',
          margin: '0 auto',
          paddingLeft: '20px',
          paddingRight: 'calc(20px + 16px)'
        }"
      >
        <el-button @click="handleSave">仅保存配置</el-button>
        <el-button type="primary" @click="handleSubmit"> 保存配置，并开始求职！ </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElForm, ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import AnyCombineBossRecommendFilter from '@renderer/features/AnyCombineBossRecommendFilter/index.vue'
import { activeDescList } from '@geekgeekrun/geek-auto-start-chat-with-boss/constant.mjs'
import { calculateTotalCombinations } from '@geekgeekrun/geek-auto-start-chat-with-boss/combineCalculator.mjs'
import { gtagRenderer } from '@renderer/utils/gtag'
import defaultTargetCompanyListConf from '@geekgeekrun/geek-auto-start-chat-with-boss/default-config-file/target-company-list.json'
import { ArrowDown } from '@element-plus/icons-vue'
import {
  MarkAsNotSuitOp,
  StrategyScopeOptionWhenMarkJobNotMatch
} from '@geekgeekrun/sqlite-plugin/src/enums'
import { debounce } from 'lodash-es'
import mittBus from '../../../utils/mitt'
import CityChooser from './components/CityChooser.vue'

const router = useRouter()

const formContent = ref({
  dingtalkRobotAccessToken: '',
  expectCompanies: '',
  anyCombineRecommendJobFilter: {},
  expectJobNameRegExpStr: '',
  expectJobTypeRegExpStr: '',
  expectJobDescRegExpStr: '',
  jobNotMatchStrategy: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
  jobNotActiveStrategy: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
  markAsNotActiveSelectedTimeRange: 7,
  expectCityList: [],
  expectCityNotMatchStrategy: MarkAsNotSuitOp.NO_OP,
  strategyScopeOptionWhenMarkJobCityNotMatch:
    StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB
})

const currentAnyCombineRecommendJobFilterCombinationCount = computed(() => {
  return calculateTotalCombinations(formContent.value.anyCombineRecommendJobFilter)
})

const unwatchAnyCombineRecommendJobFilter = ref<null | (() => void)>(null)
onBeforeUnmount(() => {
  unwatchAnyCombineRecommendJobFilter.value?.()
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
  unwatchAnyCombineRecommendJobFilter.value = watch(
    () => formContent.value?.anyCombineRecommendJobFilter,
    debounce(() => {
      gtagRenderer('any_combine_filter_changed')
    }, 2000),
    {
      deep: true
    }
  )
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

  formContent.value.jobNotMatchStrategy = strategyOptionWhenCurrentJobNotMatch
    .map((it) => it.value)
    .includes(res.config['boss.json'].jobNotMatchStrategy)
    ? res.config['boss.json'].jobNotMatchStrategy
    : MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
  formContent.value.markAsNotActiveSelectedTimeRange = isNaN(
    parseInt(String(res.config['boss.json'].markAsNotActiveSelectedTimeRange))
  )
    ? 7
    : parseInt(String(res.config['boss.json'].markAsNotActiveSelectedTimeRange))

  formContent.value.jobNotActiveStrategy = strategyOptionWhenCurrentJobNotMatch
    .map((it) => it.value)
    .includes(res.config['boss.json'].jobNotActiveStrategy)
    ? res.config['boss.json'].jobNotActiveStrategy
    : MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS

  formContent.value.expectCityList = res.config['boss.json']?.expectCityList ?? []
  formContent.value.expectCityNotMatchStrategy = strategyOptionWhenCurrentJobNotMatch
    .map((it) => it.value)
    .includes(res.config['boss.json'].expectCityNotMatchStrategy)
    ? res.config['boss.json'].expectCityNotMatchStrategy
    : MarkAsNotSuitOp.NO_OP
  formContent.value.strategyScopeOptionWhenMarkJobCityNotMatch =
    res.config['boss.json']?.strategyScopeOptionWhenMarkJobCityNotMatch ??
    StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB
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
  try {
    await formRef.value!.validate()
  } catch (err) {
    ElMessage.error({
      message: '表单校验失败，请检查有误的内容',
      grouping: true
    })
    console.log(err)
    return
  }
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))
  mittBus.emit('auto-start-chat-with-boss-config-saved')
  router.replace({
    path: '/geekAutoStartChatWithBoss/prepareRun',
    query: { flow: 'geek-auto-start-chat-with-boss' }
  })
  gtagRenderer('config_saved_and_launch_auto_start_chat', {
    has_dingtalk_robot_token: !!formContent.value?.dingtalkRobotAccessToken
  })
}
const handleSave = async () => {
  gtagRenderer('save_config_clicked', {
    has_dingtalk_robot_token: !!formContent.value?.dingtalkRobotAccessToken
  })
  normalizeExpectCompanies()
  try {
    await formRef.value!.validate()
  } catch (err) {
    ElMessage.error({
      message: '表单校验失败，请检查有误的内容',
      grouping: true
    })
    console.log(err)
    return
  }
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(formContent.value))
  mittBus.emit('auto-start-chat-with-boss-config-saved')
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
const expectCompanyTemplateList = [
  {
    name: '默认值',
    value: defaultTargetCompanyListConf.join(',')
  },
  {
    name: '不限公司（随便投）',
    value: ''
  },
  {
    name: '大厂及关联企业',
    value: `抖音,字节,字跳,有竹居,脸萌,头条,懂车帝,滴滴,嘀嘀,巨量引擎,小桔,网易,有道,腾讯,酷狗,酷我,阅文,搜狗,小鹅通,富途,京东,沃东天骏,达达,达冠,百度,昆仑芯,小度,度小满,爱奇艺,携程,趣拿,去哪儿,集度,智图,长地万方,瑞图万方,道道通,小熊博望,理想,蔚来,顺丰,丰巢,中通,圆通,申通,跨越,讯飞,同程,艺龙,马蜂窝,贝壳,自如,链家,我爱我家,相寓,多点,金山,小米,猎豹,新浪,微博,阿里,淘宝,淘麦郎,天猫,盒马,口碑,优视,夸克,UC,蚂蚁,高德,LAZADA,来赞达,飞猪,菜鸟,哈啰,钉钉,乌鸫,饿了么,美团,三快,猫眼,快手,映客,小红书,行吟,奇虎,360,三六零,鸿盈,奇富,奇元,亚信,启明星辰,奇安信,深信服,长亭,绿盟,天融信,商汤,SenseTime,大华,海康威视,hikvision,汽车之家,车好多,瓜子,易车,昆仑万维,昆仑天工,闲徕,趣加,FunPlus,完美,马上消费,轻松,水滴,白龙马,58,车欢欢,五八,红布林,致美,快狗,天鹅到家,转转,美餐,知乎,智者四海,易点云,搜狐,用友,畅捷通,猿辅导,小猿,猿力,好未来,学而思,希望学,新东方,东方甄选,东方优选,作业帮,高途,跟谁学,学科网,天学网,一起教育,一起作业,美术宝,火花思维,粉笔,51talk,爱学习,高思,老虎国际,一心向上,向上一意,联想,拉勾,乐视,欢聚,竞技世界,拼多多,寻梦,从鲸,TEMU,得物,有赞,Moka,希瑞亚斯,北森,OPPO,欧珀,vivo,维沃,小天才,步步高,读书郎,货拉拉,陌陌,探探,Shopee,虾皮,首汽租车,GoFun,神州租车,天眼查,旷视,小冰,美图,智谱华章,MiniMax,石头科技,迅雷,TP,锐捷,Tenda,腾达,斐讯,希音,SHEIN,稀宇,深言,百川智能,与爱为舞,牵手,Grab,爱回收,洋钱罐,瓴岳,得到,思维造物,地平线,咪咕,翼支付,电信,天翼,联通,蓝湖,墨刀,海尔,美的,米哈游,传音,同花顺,国美,TCL`
  },
  {
    name: '阿里系',
    value: `阿里,淘宝,淘麦郎,天猫,盒马,口碑,优视,夸克,UC,蚂蚁,飞猪,乌鸫,饿了么,LAZADA,来赞达,菜鸟,哈啰,钉钉,高德,白龙马,新浪,微博`
  },
  {
    name: '字节（头条/抖音）系',
    value: `抖音,字节,字跳,有竹居,脸萌,头条,懂车帝,巨量引擎`
  },
  {
    name: '百度系',
    value: `百度,昆仑芯,小度,度小满,爱奇艺,携程,趣拿,去哪儿,集度,作业帮,智图,长地万方,瑞图万方,道道通,小熊博望`
  },
  {
    name: '腾讯系',
    value: `腾讯,酷狗,酷我,阅文,搜狗,小鹅通,富途,京东,沃东天骏,达达,达冠,美团,三快,猫眼,快手,拼多多,寻梦,从鲸,TEMU,Shopee,虾皮,滴滴,嘀嘀,小桔`
  },
  {
    name: '外包、劳务派遣企业',
    value: `青钱,软通动力,南天,睿服,中电金信,佰钧成,云链,博彦,汉克时代,柯莱特,拓保,亿达信息,纬创,微创,微澜,诚迈科技,法本,兆尹,诚迈,联合永道,新致软件,宇信科技,华为,德科,FESCO,科锐,科之锐`
  }
]
function handleExpectCompanyTemplateClicked(item) {
  gtagRenderer('expect_company_tpl_clicked', {
    name: item.name
  })
  formContent.value.expectCompanies = item.value
}

const expectJobFilterTemplateList = [
  {
    name: '不限职位（随便投）',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '',
      expectJobDescRegExpStr: ''
    }
  },
  {
    name: '研发 - 前端开发工程师',
    config: {
      expectJobNameRegExpStr: '前端|H5|FE',
      expectJobTypeRegExpStr: '前端开发|javascript',
      expectJobDescRegExpStr: '前端|vue|react|node|js|javascript|H5'
    }
  },
  {
    name: '研发 - Java',
    config: {
      expectJobNameRegExpStr: '\\bJava\\b',
      expectJobTypeRegExpStr: '\\bJava\\b',
      expectJobDescRegExpStr: '\\bJava\\b|JVM|消息队列|MQ|MySQL|Nginx|Redis|Dubbo'
    }
  },
  {
    name: '人力 - 员工关系',
    config: {
      expectJobNameRegExpStr: '员工关系|劳动关系|SSC|人力资源|人资',
      expectJobTypeRegExpStr: '员工关系|人力资源',
      expectJobDescRegExpStr: '社保|考勤|入职|离职'
    }
  },
  {
    name: '人力 - 招聘',
    config: {
      expectJobNameRegExpStr: '招聘|招聘HR|招聘专员|招聘顾问|招聘专家|Recruiter|人力资源|人资',
      expectJobTypeRegExpStr: '招聘|人力资源|猎头顾问',
      expectJobDescRegExpStr: '简历筛选|面试安排|offer|猎头'
    }
  }
]
function handleExpectJobFilterTemplateClicked(item) {
  gtagRenderer('expect_job_filter_tpl_clicked', {
    name: item.name
  })

  Object.assign(formContent.value, {
    ...item.config
  })
}

const strategyOptionWhenCurrentJobNotMatch = [
  {
    name: '在Boss直聘上标记不合适（推荐，这确保Boss直聘推荐新职位来置换不合适职位）',
    value: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
  },
  {
    name: '在本地数据库中标记不合适，且7天内再遇到这个职位时直接跳过',
    value: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
  },
  {
    name: '仅在本次运行中记录不合适，且本次运行再遇到这个职位时直接跳过',
    value: MarkAsNotSuitOp.NO_OP
  }
]

const strategyScopeOptionWhenMarkJobNotMatch = [
  {
    name: '所有职位',
    value: StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
  },
  {
    name: '仅和“期望公司白名单”匹配的职位',
    value: StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB
  }
]

const noActiveDefinitionMarks = computed(() => {
  let arr = [...activeDescList]
  arr.shift()
  arr.unshift('不筛选')
  arr = arr.map((it, index) => {
    if (index <= formContent.value.markAsNotActiveSelectedTimeRange) {
      if (formContent.value.markAsNotActiveSelectedTimeRange > 0 && index === 0) {
        return it
      }
      return {
        style: {
          color: '#1989FA',
          fontWeight: 700
        },
        label: it
      }
    }
    return it
  })
  return arr
})
</script>

<style scoped lang="scss">
.form-wrap {
  max-height: 100vh;
  overflow: auto;
  padding-top: 20px;
  padding-left: 20px;
  padding-right: 20px;
  padding-bottom: 20px;
  .config-section + .config-section {
    margin-top: 10px;
  }
  :deep(.el-form) {
    max-width: 1000px;
    margin: 0 auto;
  }
  .last-form-item {
    :deep(.el-form-item__content) {
      margin-top: 0px;
      justify-content: flex-end;
    }
  }
}
.no-active-definition-text-slider {
  ::v-deep(.el-slider__marks-text) {
    font-size: 12px;
    margin-top: 22px;
    &::before {
      content: '';
      bottom: calc(100% - 6px);
      z-index: -1;
      left: 50%;
      transform: translateX(-50%);
      position: absolute;
      display: block;
      width: 2px;
      height: 20px;
      background-image: linear-gradient(var(--el-slider-runway-bg-color), transparent);
    }
  }
  ::v-deep(.el-slider__stop) {
    box-shadow: 0 0 0 2px rgba(52, 137, 255, 0.3);
  }
  ::v-deep(.el-slider__button) {
    transform: rotate(45deg);
    border-radius: 10px 10px 0px 10px;
    --el-slider-button-size: 18px;
  }
}
.job-detail-filter-wrap {
  transition: 0.2s ease margin-bottom;
  &:has(.el-form-item__error) {
    margin-bottom: 40px;
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
