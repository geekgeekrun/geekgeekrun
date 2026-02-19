<template>
  <div class="common-job-condition-config" flex flex-col h-full>
    <div flex-1 of-auto>
      <el-form
        ref="formRef"
        :model="formContent"
        :rules="formRules"
        inline-message
        w-800px
        pt-30px
        pb-30px
        ml-auto
        mr-auto
      >
        <div mb20px>公共职位筛选条件</div>
        <el-form-item prop="expectCompanies" mb0>
          <div
            font-size-14px
            flex
            mb6px
            :style="{
              justifyContent: 'space-between',
              alignItems: 'baseline',
              width: '100%',
              lineHeight: '1.25em'
            }"
          >
            <div>
              期望投递公司
              <br /><span font-size-12px
                ><b color-orange>逗号分隔</b>，不区分大小写；输入框留空表示不筛选</span
              >
            </div>
            <el-dropdown @command="handleExpectCompanyTemplateClicked">
              <el-button size="small"
                >公司列表模板 <el-icon class="el-icon--right"><arrow-down /></el-icon
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
            placeholder="置空表示“不限公司，任意公司都可以投递”"
            @blur="
              formContent.expectCompanies = normalizeCommaSplittedStr(formContent.expectCompanies)
            "
          />
        </el-form-item>
        <div class="h-1px bg-#f0f0f0" mt16px mb8px />
        <div
          ref="blockCompanyNameRegExpSectionEl"
          font-size-14px
          flex
          :style="{
            justifyContent: 'space-between',
            alignItems: 'baseline',
            width: '100%',
            lineHeight: '1.25em'
          }"
        >
          <div mb6px>
            不期望投递公司<b color-orange>正则</b><br /><span font-size-12px
              ><b color-orange>正则表达式</b>，不区分大小写；输入框留空表示不筛选；<span
                color-orange
                >优先级高于上方“期望投递公司”</span
              ><br />请<b color-red>小心验证</b
              >你编写的正则，填写太过于宽泛的正则（例如`.*`）将导致任何职位都不会开聊</span
            >
          </div>
          <el-dropdown @command="handleBlockCompanyNameRegExpTemplateClicked">
            <el-button size="small"
              >公司列表模板 <el-icon class="el-icon--right"><arrow-down /></el-icon
            ></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="item in blockCompanyNameRegExpTemplateList"
                  :key="item.name"
                  :command="item"
                  >{{ item.name }}</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div
          class="block-company-filter-wrap"
          :style="{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '10px'
          }"
        >
          <el-form-item prop="blockCompanyNameRegExpStr" mb0 w-full>
            <el-input
              v-model="formContent.blockCompanyNameRegExpStr"
              :autosize="{ minRows: 4 }"
              max-h-8lh
              type="textarea"
              placeholder="置空表示“不限公司，任意公司都不会被标记为不合适”"
              @blur="
                formContent.blockCompanyNameRegExpStr =
                  formContent.blockCompanyNameRegExpStr?.trim() ?? ''
              "
            />
          </el-form-item>
        </div>
        <div class="h-1px bg-#f0f0f0" mt16px mb16px />
        <div mt16px>
          <div font-size-14px mb8px>工作地</div>
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
                <city-chooser v-model="formContent.expectCityList">
                  <template #default="{ modelValue, showDialog, clearValue }">
                    <div v-if="modelValue?.length">
                      <div>当前已选择城市：</div>
                      <div flex flex-wrap gap-10px>
                        <el-tag v-for="it in modelValue" :key="it">
                          {{ it }}
                        </el-tag>
                      </div>
                    </div>
                    <div v-else>
                      <div>当前未选择任何期望城市，将不会按照城市进行筛选</div>
                    </div>
                    <div
                      line-height-1
                      :style="{
                        marginTop: modelValue?.length ? '10px' : ''
                      }"
                    >
                      <el-button
                        size="small"
                        type="primary"
                        @click="
                          () => {
                            // isDialogVisible = true
                            showDialog()
                            gtagRenderer('choose_city_entry_button_clicked')
                          }
                        "
                        >选择城市</el-button
                      >
                      <el-button
                        v-if="modelValue?.length"
                        size="small"
                        type="danger"
                        @click="clearValue"
                        >清空已选择的所有城市</el-button
                      >
                    </div>
                  </template>
                </city-chooser>
              </div>
            </el-form-item>
          </div>
        </div>
        <div class="h-1px bg-#f0f0f0" mt16px mb16px />
        <div mt16px>
          <div font-size-14px mb8px>
            薪资（仅支持按月计算薪资的职位；非按月计算薪资职位（例如兼职职位、实习职位）将直接跳过）
          </div>
          <div
            :style="{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '10px'
            }"
          >
            <div>
              <el-form-item prop="expectSalaryLow" mb10px>
                <div w-full>
                  <div font-size-12px>薪资筛选方式</div>
                  <el-select
                    v-model="formContent.expectSalaryCalculateWay"
                    @change="handleExpectSalaryCalculateWayChanged"
                  >
                    <el-option
                      v-for="op in expectSalaryCalculateWayOption"
                      :key="op.value"
                      :label="op.name"
                      :value="op.value"
                      >{{ op.name }}</el-option
                    >
                  </el-select>
                </div>
              </el-form-item>
              <el-form-item prop="expectSalaryLow" mb10px>
                <div>
                  <div font-size-12px>期望薪资范围</div>
                  <div>
                    <el-input-number
                      v-model="formContent.expectSalaryLow"
                      controls-position="right"
                      :min="0"
                      :step="0.25"
                      placeholder="不设置"
                      @change="
                        () => {
                          gtagRenderer('expect_salary_low_changed')
                          ensureSalaryRangeCorrect({ formContent })
                        }
                      "
                    >
                      <template #prefix>下限</template>
                      <template #suffix>
                        <template v-if="formContent.expectSalaryLow">
                          <template
                            v-if="
                              formContent.expectSalaryCalculateWay ===
                              SalaryCalculateWay.MONTH_SALARY
                            "
                            >k</template
                          >
                          <template
                            v-if="
                              formContent.expectSalaryCalculateWay ===
                              SalaryCalculateWay.ANNUAL_PACKAGE
                            "
                            >W</template
                          >
                        </template>
                      </template>
                    </el-input-number>
                    -
                    <el-input-number
                      v-model="formContent.expectSalaryHigh"
                      controls-position="right"
                      :min="0"
                      :step="0.25"
                      placeholder="不设置"
                      @change="
                        () => {
                          gtagRenderer('expect_salary_high_changed')
                          ensureSalaryRangeCorrect({ formContent })
                        }
                      "
                    >
                      <template #prefix>上限</template>
                      <template #suffix>
                        <template v-if="formContent.expectSalaryHigh">
                          <template
                            v-if="
                              formContent.expectSalaryCalculateWay ===
                              SalaryCalculateWay.MONTH_SALARY
                            "
                            >k</template
                          >
                          <template
                            v-if="
                              formContent.expectSalaryCalculateWay ===
                              SalaryCalculateWay.ANNUAL_PACKAGE
                            "
                            >W</template
                          >
                        </template>
                      </template>
                    </el-input-number>
                  </div>
                </div>
              </el-form-item>
              <el-form-item
                v-if="
                  formContent.expectSalaryCalculateWay === SalaryCalculateWay.ANNUAL_PACKAGE &&
                  (formContent.expectSalaryLow || formContent.expectSalaryHigh)
                "
                mb10px
              >
                <div>
                  <div font-size-12px>薪资范围满足以下条件的职位将会被匹配</div>
                  <div>
                    <div flex flex-nowrap flex-items-start>
                      <template
                        v-for="(mGroup, index) in [
                          [12, 13, 14, 15, 16, 17, 18],
                          [19, 20, 21, 22, 23, 24]
                        ]"
                        :key="index"
                      >
                        <table
                          :style="{
                            lineHeight: '1.25em'
                          }"
                        >
                          <tr>
                            <th
                              v-for="(text, i) in ['月薪下限', '月薪上限', '']"
                              :key="i"
                              :style="{
                                borderBottom: '2px solid #f0f0f0'
                              }"
                            >
                              {{ text }}
                            </th>
                          </tr>
                          <tr v-for="m in mGroup" :key="m">
                            <td>
                              {{
                                formContent.expectSalaryLow
                                  ? ((formContent.expectSalaryLow / m) * 10).toFixed(2)
                                  : '无下限'
                              }}<small v-if="formContent.expectSalaryLow" class="color-#999 ml-2px"
                                >k</small
                              >
                            </td>
                            <td>
                              {{
                                formContent.expectSalaryHigh
                                  ? ((formContent.expectSalaryHigh / m) * 10).toFixed(2)
                                  : '无上限'
                              }}<small v-if="formContent.expectSalaryHigh" class="color-#999 ml-2px"
                                >k</small
                              >
                            </td>
                            <td>{{ m }}薪</td>
                          </tr>
                        </table>
                        <div v-if="index !== 1" class="bg-#f0f0f0 w-2px flex-self-stretch"></div>
                      </template>
                    </div>
                  </div>
                </div>
              </el-form-item>
            </div>
          </div>
        </div>
        <div class="h-1px bg-#f0f0f0" mt16px mb16px />
        <div>
          <div
            flex
            :style="{
              alignItems: 'center',
              justifyContent: 'space-between'
            }"
          >
            <div font-size-14px>期望职位信息</div>
            <div>
              <el-dropdown ml20px @command="handleExpectJobFilterTemplateClicked">
                <el-button size="small"
                  >职位详情筛选模板（按职类区分）
                  <el-icon class="el-icon--right"><arrow-down /></el-icon
                ></el-button>
                <template #dropdown>
                  <el-dropdown-menu
                    :style="{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr'
                    }"
                  >
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
              width: '100%',
              display: 'flex',
              gap: '10px'
            }"
          >
            <div flex-1>
              <el-form-item mb0 prop="expectJobNameRegExpStr">
                <div font-size-12px>职位名称/类型/描述 正则匹配筛选逻辑</div>
                <el-select
                  v-model="formContent.jobDetailRegExpMatchLogic"
                  @change="(value) => gtagRenderer('job_detail_re_ml_change', { value })"
                >
                  <el-option
                    v-for="op in jobDetailRegExpMatchLogicOptions"
                    :key="op.value"
                    :label="op.name"
                    :value="op.value"
                    >{{ op.name }}</el-option
                  >
                </el-select>
              </el-form-item>
              <div
                :style="{
                  width: '100%',
                  height: '1px',
                  backgroundColor: '#f0f0f0',
                  marginTop: '0.5lh'
                }"
              />
              <div
                :style="{
                  display: 'grid',
                  gridTemplateColumns: '2em 1fr',
                  gap: '5px',
                  flex: 1,
                  alignItems: 'end'
                }"
                class="job-detail-filter-wrap"
              >
                <div></div>
                <el-tooltip
                  effect="light"
                  placement="bottom"
                  @show="gtagRenderer('tooltip_show_about_how_to_fill_df')"
                >
                  <template #content>
                    <div w-800px>
                      <div style="margin-top: 4px; margin-bottom: 4px">
                        上方“职位名称/类型/描述
                        正则匹配筛选逻辑”配置，你可以自行决定如下三个正则“所有正则匹配时才认为职位匹配”还是“任一正则匹配时即认为职位匹配”。
                      </div>
                      <ul m0>
                        <li>
                          当选择“所有正则匹配时才认为职位匹配”规则时，如果你留空某个输入框，表示任何职位一定匹配这个条件。
                        </li>
                        <li>
                          当选择“任一正则匹配时即认为职位匹配”规则时，如果你留空某个输入框，表示任何职位一定不匹配这个条件。
                        </li>
                      </ul>
                      <b>请注意</b>，如果<span color-orange>三个输入框均留空</span
                      >，无论上方“职位名称/类型/描述 正则匹配筛选逻辑”配置是什么，都表示<span
                        color-orange
                        >列表中出现的任意职位都将认为同时匹配这三个条件（即不根据职位名称/类型/描述进行筛选）</span
                      >。<br />
                      因此，可以按照如下场景填写你对于期望职位的筛选条件：
                      <ul style="margin-top: 4px; margin-bottom: 4px">
                        <li>
                          如果你只考虑工作类型，请填写“职位类型正则”输入框，其余两个输入框清空。这可以确保求职方向基本正确。
                        </li>
                        <li>
                          如果你着重关注职位描述，请填写“职位描述正则”，其余两个输入框酌情填写。
                        </li>
                        <li>
                          如果你想开聊列表里的推荐的任意职位，不根据职位名称/类型/描述进行筛选，请清空这三个输入框。
                        </li>
                      </ul>
                      <div>
                        你可以在右侧"职位详情筛选模板"选择一个模板，并在选中模板基础上尝试修改
                      </div>
                      <div>
                        <b>“职位类型正则”填写过程中请注意</b
                        >，“职位类型”是由BOSS直聘预定义好的一系列职位分类，因此<b>请按照这个分类来编写正则</b>。<br />
                        <!-- 这个分类可以在此找到：<br />
                        <img w-400px src="../resources/job-type-source-entry.png" /> -->
                      </div>
                      <div>
                        关于误伤/误投的排查，<a
                          href="javascript:;"
                          style="color: var(--el-color-primary)"
                          @click.prevent="handleHowToFillDetailFilterClick"
                          >请参阅这个链接</a
                        >
                      </div>
                    </div>
                  </template>
                  <el-button
                    type="text"
                    font-size-12px
                    :style="{
                      width: 'fit-content',
                      padding: '0',
                      height: 'auto',
                      position: 'relative',
                      top: '6px'
                    }"
                    ><span><QuestionFilled w-1em h-1em mr2px /></span
                    >如下三个输入框工作机制是怎样的？怎样填写？误伤/误投如何排查？</el-button
                  >
                </el-tooltip>
                <div></div>
                <el-form-item mb0 prop="expectJobNameRegExpStr">
                  <div font-size-12px>职位名称正则（不区分大小写）</div>
                  <el-input
                    v-model="formContent.expectJobNameRegExpStr"
                    type="textarea"
                    :placeholder="
                      getJobDetailRegExpMatchLogicConfig({ formContent }).inputPlaceholderText
                    "
                    :autosize="{ minRows: 2 }"
                    max-h-6lh
                    @blur="
                      formContent.expectJobNameRegExpStr =
                        formContent.expectJobNameRegExpStr?.trim() ?? ''
                    "
                  />
                </el-form-item>
                <div
                  mb0px
                  font-size-12px
                  flex
                  flex-justify-center
                  fw-800
                  flex-self-start
                  position-relative
                  style="top: 42px"
                >
                  {{ getJobDetailRegExpMatchLogicConfig({ formContent }).logicText }}
                </div>
                <el-form-item mb0 prop="expectJobTypeRegExpStr">
                  <div ref="jobDetailRegExpSectionEl" font-size-12px>
                    职位类型正则（推荐填写，不区分大小写）
                  </div>
                  <el-input
                    v-model="formContent.expectJobTypeRegExpStr"
                    type="textarea"
                    :placeholder="
                      getJobDetailRegExpMatchLogicConfig({ formContent }).inputPlaceholderText
                    "
                    :autosize="{ minRows: 2 }"
                    max-h-6lh
                    @blur="
                      formContent.expectJobTypeRegExpStr =
                        formContent.expectJobTypeRegExpStr?.trim() ?? ''
                    "
                  />
                </el-form-item>
                <div
                  mb0px
                  font-size-12px
                  flex
                  flex-justify-center
                  fw-800
                  flex-self-start
                  position-relative
                  style="top: 42px"
                >
                  {{ getJobDetailRegExpMatchLogicConfig({ formContent }).logicText }}
                </div>
                <el-form-item mb0 prop="expectJobDescRegExpStr">
                  <div font-size-12px>职位描述正则（不区分大小写）</div>
                  <el-input
                    v-model="formContent.expectJobDescRegExpStr"
                    type="textarea"
                    :placeholder="
                      getJobDetailRegExpMatchLogicConfig({ formContent }).inputPlaceholderText
                    "
                    :autosize="{ minRows: 2 }"
                    max-h-6lh
                    @blur="
                      formContent.expectJobDescRegExpStr =
                        formContent.expectJobDescRegExpStr?.trim() ?? ''
                    "
                  />
                </el-form-item>
              </div>
            </div>
          </div>
        </div>
      </el-form>
    </div>
    <div class="bg-#f8f8f8 pb10px pt10px">
      <div
        :style="{
          display: 'flex',
          justifyContent: 'end',
          maxWidth: '800px',
          margin: '0 auto',
          paddingLeft: '20px',
          paddingRight: 'calc(20px + 16px)'
        }"
      >
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="tsx">
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'
import { SalaryCalculateWay } from '@geekgeekrun/sqlite-plugin/src/enums'
import CityChooser from '../MainLayout/GeekAutoStartChatWithBoss/components/CityChooser.vue'
import { QuestionFilled, ArrowDown } from '@element-plus/icons-vue'

import {
  getJobDetailRegExpMatchLogicConfig,
  expectSalaryCalculateWayOption,
  ensureSalaryRangeCorrect,
  expectCompanyTemplateList,
  blockCompanyNameRegExpTemplateList,
  getHandlerForBlockCompanyNameRegExpTemplateClicked,
  getHandlerForExpectCompanyTemplateClicked,
  getHandlerForExpectJobFilterTemplateClicked,
  getRuleOfExpectJobNameRegExpStr,
  getRuleOfExpectJobDescRegExpStr,
  getRuleOfExpectJobTypeRegExpStr,
  getRuleOfBlockCompanyNameRegExpStr,
  jobDetailRegExpMatchLogicOptions,
  getHandlerForExpectSalaryCalculateWayChanged,
  normalizeCommaSplittedStr
} from '../MainLayout/GeekAutoStartChatWithBoss/common'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import expectJobFilterTemplateList from '../MainLayout/GeekAutoStartChatWithBoss/expectJobFilterTemplateList'

const gtagRenderer = (name, params?: object) => {
  return baseGtagRenderer(name, {
    scene: 'cjc_config',
    ...params
  })
}
const router = useRouter()

const formContent = ref({
  expectJobNameRegExpStr: '',
  expectJobTypeRegExpStr: '',
  expectJobDescRegExpStr: '',
  expectSalaryCalculateWay: SalaryCalculateWay.ANNUAL_PACKAGE,
  expectSalaryHigh: null,
  expectSalaryLow: null,
  blockCompanyNameRegExpStr: ''
})

const jobDetailRegExpSectionEl = ref<HTMLDivElement>()
const blockCompanyNameRegExpSectionEl = ref<HTMLDivElement>()
const formRules = computed(() => ({
  expectJobNameRegExpStr: {
    trigger: 'blur',
    validator: getRuleOfExpectJobNameRegExpStr({ gtagRenderer, jobDetailRegExpSectionEl })
  },
  expectJobTypeRegExpStr: {
    trigger: 'blur',
    validator: getRuleOfExpectJobTypeRegExpStr({ gtagRenderer, jobDetailRegExpSectionEl })
  },
  expectJobDescRegExpStr: {
    trigger: 'blur',
    validator: getRuleOfExpectJobDescRegExpStr({ gtagRenderer, jobDetailRegExpSectionEl })
  },
  blockCompanyNameRegExpStr: {
    trigger: 'blur',
    validator: getRuleOfBlockCompanyNameRegExpStr({ gtagRenderer, blockCompanyNameRegExpSectionEl })
  }
}))

const handleBlockCompanyNameRegExpTemplateClicked =
  getHandlerForBlockCompanyNameRegExpTemplateClicked({
    gtagRenderer,
    formContent
  })

const handleExpectCompanyTemplateClicked = getHandlerForExpectCompanyTemplateClicked({
  gtagRenderer,
  formContent
})

const handleExpectJobFilterTemplateClicked = getHandlerForExpectJobFilterTemplateClicked({
  gtagRenderer,
  formContent
})

function handleHowToFillDetailFilterClick() {
  gtagRenderer('click_linux_do_how_to_fill_df')
  electron.ipcRenderer.send(
    'open-external-link',
    'https://linux.do/t/topic/640626/74?u=geekgeekrun'
  )
}

const handleExpectSalaryCalculateWayChanged = getHandlerForExpectSalaryCalculateWayChanged({
  gtagRenderer,
  formContent
})

function handleCancel() {
  //
  window.close()
}

const formRef = ref()
async function handleSave() {
  await formRef.value?.validate()
  //
}
</script>

<style lang="scss">
.common-job-condition-config .el-form-item__error.el-form-item__error--inline {
  margin-left: 0;
}
</style>
