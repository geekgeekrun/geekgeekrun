<template>
  <div class="geek-auto-start-run-with-boss__wrap">
    <div
      class="main__wrap"
      :style="{
        display: 'flex',
        flexDirection: 'column'
      }"
    >
      <div class="form-wrap geek-auto-start-run-with-boss">
        <el-form ref="formRef" :model="formContent" label-position="top" :rules="formRules">
          <el-card class="config-section">
            <div>
              <div font-size-14px>
                摸鱼模式
                <el-tooltip
                  effect="light"
                  placement="bottom-start"
                  @show="gtagRenderer('tooltip_show_about_sage_t')"
                >
                  <template #content>
                    <div>
                      本程序运行较长时间后，BOSS直聘会对账号进行风控，导致本程序不能继续执行。<br />
                      为此，加入摸鱼模式。通过此配置，主动减慢本程序的运行速度，降低潜在的被风控监测到的概率。<br />
                      你可以自定义开启摸鱼模式的频率 - 默认为操作100次后，暂停运行15分钟。
                    </div>
                  </template>
                  <el-button type="text" font-size-12px
                    ><span><QuestionFilled w-1em h-1em mr2px /></span
                    >这个配置会对本程序运行过程造成什么影响？</el-button
                  >
                </el-tooltip>
              </div>
              <div>
                <el-checkbox
                  v-model="formContent.isSageTimeEnabled"
                  @change="
                    (v) => {
                      gtagRenderer('sage_t_enable_changed', { v })
                    }
                  "
                >
                  启用摸鱼模式
                </el-checkbox>
              </div>
              <div pl-1.5em font-size-12px>
                <div
                  :style="{
                    color: formContent.isSageTimeEnabled ? '' : '#aaa'
                  }"
                >
                  当如下行为的次数总计达
                  <el-form-item mb0 inline-block prop="sageTimeOpTimes">
                    <el-input-number
                      v-model="formContent.sageTimeOpTimes"
                      :step="1"
                      step-strictly
                      :precision="0"
                      :min="1"
                      :disabled="!formContent.isSageTimeEnabled"
                      controls-position="right"
                      @change="
                        (v) => {
                          gtagRenderer('sage_t_op_times_changed', { v })
                        }
                      "
                    />
                  </el-form-item>
                  次时，暂停运行
                  <el-form-item mb0 inline-block prop="sageTimePauseMinute">
                    <el-input-number
                      v-model="formContent.sageTimePauseMinute"
                      :step="0.5"
                      step-strictly
                      :precision="1"
                      :min="0"
                      :disabled="!formContent.isSageTimeEnabled"
                      controls-position="right"
                      @change="
                        (v) => {
                          gtagRenderer('sage_t_pause_minute_changed', { v })
                        }
                      "
                    />
                  </el-form-item>
                  分钟：
                  <ul
                    pl-1em
                    mb0
                    mt14px
                    :style="{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      lineHeight: '1.5em'
                    }"
                  >
                    <li>职位来源变更</li>
                    <li>职位列表滚动后发生加载</li>
                    <li>职位详情加载</li>
                    <li>职位被标记不合适</li>
                    <li>职位被开聊</li>
                  </ul>
                  <div mt14px>之后继续运行并重新计次，循环整个过程</div>
                </div>
              </div>
            </div>
          </el-card>
          <el-card class="config-section">
            <el-form-item class="job-source-form-item" prop="__jobSourceList">
              <div w-full>
                <div ref="jobSourceFormItemSectionEl" font-size-16px>
                  <div>
                    你想投递BOSS直聘上哪些列表里的职位？
                    <el-tooltip
                      effect="light"
                      placement="bottom-start"
                      @show="gtagRenderer('tooltip_show_about_job_source_ui')"
                    >
                      <template #content>
                        <div m0 line-height-1.5em w-fit-content>
                          <img block h-320px src="../resources/intro-of-job-source.png" />
                        </div>
                      </template>
                      <el-button type="text" font-size-12px
                        ><span><QuestionFilled w-1em h-1em mr2px /></span
                        >下方展示的各条目与BOSS直聘界面对应关系是怎样的？</el-button
                      >
                    </el-tooltip>
                  </div>
                </div>
                <div font-size-12px>
                  拖放条目前方的手柄以调整职位列表查找顺序；点击条目前方的开关以启用/禁用对应的职位列表
                </div>
                <JobSourceDragOrderer
                  v-model="formContent.__jobSourceList"
                  class="job-source-drag-orderer"
                />
              </div>
            </el-form-item>
            <el-form-item prop="filter" mt18px mb0px w-full>
              <div flex-1>
                <div font-size-16px>
                  你希望BOSS直聘为你筛选出什么样的职位？
                  <el-tooltip
                    effect="light"
                    placement="bottom-start"
                    @show="gtagRenderer('tooltip_show_about_wrongly_mark_not_suit')"
                  >
                    <template #content>
                      <ul m0 line-height-1.5em w-540px pl2em>
                        <li>
                          这个配置决定了下面列表中会展示哪些职位。查找职位时，会在BOSS直聘页面上自动组合下方设置的筛选条件。对应UI：<br />
                          <img h-270px src="../resources/intro-of-job-filter-auto-change.png" />
                        </li>
                        <li color-orange>
                          建议不要筛选过多条件，否则最终组合数会成为一个很大的数字。这将在当前职位中尝试太多筛选条件，不能及时进入下一个职位，且会增加命中风控的概率
                        </li>
                      </ul>
                    </template>
                    <el-button type="text" font-size-12px
                      ><span><QuestionFilled w-1em h-1em mr2px /></span
                      >这个配置是如何工作的？</el-button
                    >
                  </el-tooltip>
                </div>
                <div>
                  <div>
                    <div font-size-12px>筛选条件遍历方式</div>
                    <el-select
                      v-model="formContent.combineRecommendJobFilterType"
                      w-320px
                      @change="
                        (v) => {
                          gtagRenderer('crjf_type_changed', { v })
                        }
                      "
                    >
                      <el-option
                        v-for="op in combineRecommendJobFilterTypeOptions"
                        :key="op.value"
                        :value="op.value"
                        :label="op.name"
                        >{{ op.name }}</el-option
                      >
                    </el-select>
                  </div>
                  <div
                    v-if="
                      formContent.combineRecommendJobFilterType ===
                      CombineRecommendJobFilterType.STATIC_COMBINE
                    "
                    mt8px
                  >
                    <StaticCombineBossRecommendFilter
                      v-model="formContent.staticCombineRecommendJobFilterConditions"
                    />
                  </div>
                  <div v-else mt8px>
                    <AnyCombineBossRecommendFilter
                      v-model="formContent.anyCombineRecommendJobFilter"
                    />
                    <div mb0>
                      <el-checkbox
                        v-if="anyCombineBossRecommendFilterHasCondition"
                        v-model="formContent.isSkipEmptyConditionForCombineRecommendJobFilter"
                        @change="
                          (v) => {
                            gtagRenderer('is_skip_empty_condition_4crjf_changed', { v })
                          }
                        "
                      >
                        <span font-size-12px>跳过初始空条件，直接使用设置的条件查找职位</span>
                      </el-checkbox>
                      <el-checkbox v-else :model-value="false" disabled>
                        <span font-size-12px>跳过初始空条件，直接使用设置的条件查找职位</span>
                      </el-checkbox>
                    </div>
                  </div>
                </div>
                <div font-size-12px>
                  当前组合条件数：{{
                    currentAnyCombineRecommendJobFilterCombinationCount.toLocaleString()
                  }}
                  <span
                    v-if="currentAnyCombineRecommendJobFilterCombinationCount >= 5"
                    class="color-orange"
                    >不建议选择太多组合条件 -
                    否则将在当前职位中尝试太多筛选条件，不能及时进入下一个职位，且会增加命中风控的概率</span
                  >
                </div>
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
            <el-form-item
              :key="!formContent.fieldsForUseCommonConfig.expectCompanies"
              :prop="
                !formContent.fieldsForUseCommonConfig.expectCompanies
                  ? 'expectCompanies'
                  : undefined
              "
              mb0
            >
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
                  期望投递公司&nbsp;<el-tooltip
                    effect="light"
                    placement="bottom-start"
                    @show="gtagRenderer('tooltip_show_about_expect_company_figure')"
                  >
                    <template #content>
                      <img block h-270px src="../resources/intro-of-job-entry.png" />
                    </template>
                    <el-button type="text" font-size-12px
                      ><span><QuestionFilled w-1em h-1em mr2px /></span
                      >公司信息UI位置图示</el-button
                    ></el-tooltip
                  ><br /><span font-size-12px
                    ><b color-orange>逗号分隔</b>，不区分大小写；输入框留空表示不筛选</span
                  >
                </div>
                <el-dropdown
                  v-if="!formContent.fieldsForUseCommonConfig.expectCompanies"
                  @command="handleExpectCompanyTemplateClicked"
                >
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
              <div w-full>
                <div flex flex-items-center>
                  <el-checkbox v-model="formContent.fieldsForUseCommonConfig.expectCompanies"
                    >使用在“公共职位筛选条件”中设置的值</el-checkbox
                  >
                  <el-button
                    v-if="formContent.fieldsForUseCommonConfig.expectCompanies"
                    size="small"
                    ml-10px
                    @click="handleClickConfigCommonJobCondition({ entry: 'expect-company-field' })"
                    >编辑公共职位筛选条件</el-button
                  >
                  <el-button
                    v-else
                    size="small"
                    ml-10px
                    @click="fillCommonConfigField('expectCompanies')"
                    >填入公共职位筛选条件的值</el-button
                  >
                </div>
                <el-input
                  v-if="!formContent.fieldsForUseCommonConfig.expectCompanies"
                  v-model="formContent.expectCompanies"
                  :autosize="{ minRows: 4 }"
                  max-h-8lh
                  type="textarea"
                  placeholder="置空表示“不限公司，任意公司都可以投递”"
                  @blur="
                    formContent.expectCompanies = normalizeCommaSplittedStr(
                      formContent.expectCompanies
                    )
                  "
                />
                <el-input
                  v-else
                  disabled
                  inert
                  :model-value="commonJobConditionConfig.expectCompanies ?? ''"
                  :autosize="{ minRows: 4 }"
                  max-h-8lh
                  type="textarea"
                  placeholder="置空表示“不限公司，任意公司都可以投递”"
                />
              </div>
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
                不期望投递公司<b color-orange>正则</b>&nbsp;<el-tooltip
                  effect="light"
                  placement="bottom-start"
                  @show="gtagRenderer('tooltip_show_about_expect_company_figure')"
                >
                  <template #content>
                    <img block h-270px src="../resources/intro-of-job-entry.png" />
                  </template>
                  <el-button type="text" font-size-12px
                    ><span><QuestionFilled w-1em h-1em mr2px /></span>公司信息UI位置图示</el-button
                  ></el-tooltip
                ><br /><span font-size-12px
                  ><b color-orange>正则表达式</b>，不区分大小写；输入框留空表示不筛选；<span
                    color-orange
                    >优先级高于上方“期望投递公司”</span
                  ><br />请<b color-red>小心验证</b
                  >你编写的正则，填写太过于宽泛的正则（例如`.*`）将导致任何职位都不会开聊</span
                >
              </div>
              <el-dropdown
                v-if="!formContent.fieldsForUseCommonConfig.blockCompanyNameRegExpStr"
                @command="handleBlockCompanyNameRegExpTemplateClicked"
              >
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
              <div w-full>
                <div flex flex-items-center>
                  <el-checkbox
                    v-model="formContent.fieldsForUseCommonConfig.blockCompanyNameRegExpStr"
                    >使用在“公共职位筛选条件”中设置的值</el-checkbox
                  >
                  <el-button
                    v-if="formContent.fieldsForUseCommonConfig.blockCompanyNameRegExpStr"
                    size="small"
                    ml-10px
                    @click="
                      handleClickConfigCommonJobCondition({
                        entry: 'block-company-name-reg-exp-field'
                      })
                    "
                    >编辑公共职位筛选条件</el-button
                  >
                  <el-button
                    v-else
                    size="small"
                    ml-10px
                    @click="fillCommonConfigField('blockCompanyNameRegExpStr')"
                    >填入公共职位筛选条件的值</el-button
                  >
                </div>
                <el-form-item
                  :key="!formContent.fieldsForUseCommonConfig.blockCompanyNameRegExpStr"
                  :prop="
                    !formContent.fieldsForUseCommonConfig.blockCompanyNameRegExpStr
                      ? 'blockCompanyNameRegExpStr'
                      : undefined
                  "
                  mb0
                  w-full
                >
                  <el-input
                    v-if="!formContent.fieldsForUseCommonConfig.blockCompanyNameRegExpStr"
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
                  <el-input
                    v-else
                    inert
                    disabled
                    :model-value="commonJobConditionConfig.blockCompanyNameRegExpStr"
                    :autosize="{ minRows: 4 }"
                    max-h-8lh
                    type="textarea"
                    placeholder="置空表示“不限公司，任意公司都不会被标记为不合适”"
                  />
                </el-form-item>
              </div>
              <div
                :style="{
                  width: '400px',
                  paddingLeft: '10px',
                  flex: `0 0 auto`,
                  ...((!formContent.fieldsForUseCommonConfig.blockCompanyNameRegExpStr
                    ? formContent
                    : commonJobConditionConfig
                  ).blockCompanyNameRegExpStr?.length
                    ? {
                        borderLeft: '1px solid #f0f0f0'
                      }
                    : {
                        borderLeft: '1px solid transparent',
                        visibility: 'hidden',
                        opacity: 0
                      })
                }"
              >
                <el-form-item
                  mb10px
                  :style="{
                    width: '100%'
                  }"
                >
                  <div font-size-12px>当前职位对应公司名称与不期望投递公司正则匹配时：</div>
                  <el-select
                    v-model="formContent.blockCompanyNameRegMatchStrategy"
                    @change="
                      (value) => gtagRenderer('block_company_match_strategy_changed', { value })
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
              </div>
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
                <el-form-item
                  :key="!formContent.fieldsForUseCommonConfig.city"
                  :prop="!formContent.fieldsForUseCommonConfig.city ? 'expectCityList' : undefined"
                  mb0
                >
                  <div
                    font-size-12px
                    :style="{
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      width: '100%'
                    }"
                  >
                    <div flex flex-items-center>
                      <el-checkbox v-model="formContent.fieldsForUseCommonConfig.city"
                        >使用在“公共职位筛选条件”中设置的值</el-checkbox
                      >
                      <el-button
                        v-if="formContent.fieldsForUseCommonConfig.city"
                        size="small"
                        ml-10px
                        @click="
                          handleClickConfigCommonJobCondition({
                            entry: 'city-field'
                          })
                        "
                        >编辑公共职位筛选条件</el-button
                      >
                      <el-button v-else size="small" ml-10px @click="fillCommonConfigField('city')"
                        >填入公共职位筛选条件的值</el-button
                      >
                    </div>
                    <city-chooser
                      v-if="!formContent.fieldsForUseCommonConfig.city"
                      v-model="formContent.expectCityList"
                    >
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
                    <city-chooser
                      v-else
                      :model-value="commonJobConditionConfig.expectCityList || []"
                      inert
                      opacity-60
                    >
                      <template #default="{ modelValue }">
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
                      </template>
                    </city-chooser>
                  </div>
                </el-form-item>
                <div
                  v-if="
                    (!formContent.fieldsForUseCommonConfig.city
                      ? formContent
                      : commonJobConditionConfig
                    ).expectCityList?.length
                  "
                  :style="{
                    width: '400px',
                    borderLeft: '1px solid #f0f0f0',
                    paddingLeft: '10px',
                    flex: `0 0 auto`
                  }"
                >
                  <el-form-item
                    mb10px
                    :style="{
                      width: '100%'
                    }"
                  >
                    <div font-size-12px>当前职位工作地与选择的工作地不匹配时：</div>
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
                  <div flex flex-items-center>
                    <el-checkbox v-model="formContent.fieldsForUseCommonConfig.salary"
                      >使用在“公共职位筛选条件”中设置的值</el-checkbox
                    >
                    <el-button
                      v-if="formContent.fieldsForUseCommonConfig.salary"
                      size="small"
                      ml-10px
                      @click="
                        handleClickConfigCommonJobCondition({
                          entry: 'salary-field'
                        })
                      "
                      >编辑公共职位筛选条件</el-button
                    >
                    <el-button v-else size="small" ml-10px @click="fillCommonConfigField('salary')"
                      >填入公共职位筛选条件的值</el-button
                    >
                  </div>
                  <template v-if="!formContent.fieldsForUseCommonConfig.salary">
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
                        formContent.expectSalaryCalculateWay ===
                          SalaryCalculateWay.ANNUAL_PACKAGE &&
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
                                    }}<small
                                      v-if="formContent.expectSalaryLow"
                                      class="color-#999 ml-2px"
                                      >k</small
                                    >
                                  </td>
                                  <td>
                                    {{
                                      formContent.expectSalaryHigh
                                        ? ((formContent.expectSalaryHigh / m) * 10).toFixed(2)
                                        : '无上限'
                                    }}<small
                                      v-if="formContent.expectSalaryHigh"
                                      class="color-#999 ml-2px"
                                      >k</small
                                    >
                                  </td>
                                  <td>{{ m }}薪</td>
                                </tr>
                              </table>
                              <div
                                v-if="index !== 1"
                                class="bg-#f0f0f0 w-2px flex-self-stretch"
                              ></div>
                            </template>
                          </div>
                        </div>
                      </div>
                    </el-form-item>
                  </template>
                  <template v-else>
                    <el-form-item mb10px>
                      <div w-full>
                        <div font-size-12px>薪资筛选方式</div>
                        <el-select
                          :model-value="commonJobConditionConfig.expectSalaryCalculateWay"
                          disabled
                          inert
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
                    <el-form-item mb10px>
                      <div>
                        <div font-size-12px>期望薪资范围</div>
                        <div>
                          <el-input-number
                            :model-value="commonJobConditionConfig.expectSalaryLow"
                            disabled
                            inert
                            controls-position="right"
                            :min="0"
                            :step="0.25"
                            placeholder="不设置"
                          >
                            <template #prefix>下限</template>
                            <template #suffix>
                              <template v-if="commonJobConditionConfig.expectSalaryLow">
                                <template
                                  v-if="
                                    commonJobConditionConfig.expectSalaryCalculateWay ===
                                    SalaryCalculateWay.MONTH_SALARY
                                  "
                                  >k</template
                                >
                                <template
                                  v-if="
                                    commonJobConditionConfig.expectSalaryCalculateWay ===
                                    SalaryCalculateWay.ANNUAL_PACKAGE
                                  "
                                  >W</template
                                >
                              </template>
                            </template>
                          </el-input-number>
                          -
                          <el-input-number
                            :model-value="commonJobConditionConfig.expectSalaryHigh"
                            disabled
                            inert
                            controls-position="right"
                            :min="0"
                            :step="0.25"
                            placeholder="不设置"
                          >
                            <template #prefix>上限</template>
                            <template #suffix>
                              <template v-if="commonJobConditionConfig.expectSalaryHigh">
                                <template
                                  v-if="
                                    commonJobConditionConfig.expectSalaryCalculateWay ===
                                    SalaryCalculateWay.MONTH_SALARY
                                  "
                                  >k</template
                                >
                                <template
                                  v-if="
                                    commonJobConditionConfig.expectSalaryCalculateWay ===
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
                        commonJobConditionConfig.expectSalaryCalculateWay ===
                          SalaryCalculateWay.ANNUAL_PACKAGE &&
                        (commonJobConditionConfig.expectSalaryLow ||
                          commonJobConditionConfig.expectSalaryHigh)
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
                                      commonJobConditionConfig.expectSalaryLow
                                        ? (
                                            (commonJobConditionConfig.expectSalaryLow / m) *
                                            10
                                          ).toFixed(2)
                                        : '无下限'
                                    }}<small
                                      v-if="commonJobConditionConfig.expectSalaryLow"
                                      class="color-#999 ml-2px"
                                      >k</small
                                    >
                                  </td>
                                  <td>
                                    {{
                                      commonJobConditionConfig.expectSalaryHigh
                                        ? (
                                            (commonJobConditionConfig.expectSalaryHigh / m) *
                                            10
                                          ).toFixed(2)
                                        : '无上限'
                                    }}<small
                                      v-if="commonJobConditionConfig.expectSalaryHigh"
                                      class="color-#999 ml-2px"
                                      >k</small
                                    >
                                  </td>
                                  <td>{{ m }}薪</td>
                                </tr>
                              </table>
                              <div
                                v-if="index !== 1"
                                class="bg-#f0f0f0 w-2px flex-self-stretch"
                              ></div>
                            </template>
                          </div>
                        </div>
                      </div>
                    </el-form-item>
                  </template>
                </div>
                <div
                  v-if="isShowSalaryMarkAsNotSuitStrategy"
                  :style="{
                    width: '400px',
                    borderLeft: '1px solid #f0f0f0',
                    paddingLeft: '10px',
                    flex: `0 0 auto`
                  }"
                >
                  <el-form-item
                    mb10px
                    :style="{
                      width: '100%'
                    }"
                  >
                    <div font-size-12px>当前职位薪资{{ salaryMarkAsNotSuitLabelText }}时：</div>
                    <el-select
                      v-model="formContent.expectSalaryNotMatchStrategy"
                      @change="
                        (value) =>
                          gtagRenderer('expect_salary_not_match_strategy_changed', { value })
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
                      ].includes(formContent.expectSalaryNotMatchStrategy)
                    "
                    mb0
                    :style="{
                      width: '100%'
                    }"
                  >
                    <div font-size-12px>标记不合适针对的职位范围：</div>
                    <el-select
                      v-model="formContent.strategyScopeOptionWhenMarkSalaryNotMatch"
                      @change="
                        (value) => gtagRenderer('strategy_scope_option_wmjsnm_changed', { value })
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
            </div>
            <div class="h-1px bg-#f0f0f0" mt16px mb16px />
            <div mt16px>
              <div font-size-14px mb8px>工作经验（暂不支持按日计算薪资的实习类职位）</div>
              <div
                :style="{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '10px'
                }"
              >
                <el-form-item prop="expectWorkExpList" mb0>
                  <div font-size-12px>认为匹配的工作经验</div>
                  <div
                    font-size-12px
                    :style="{
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      width: '100%'
                    }"
                  >
                    <el-select
                      v-model="formContent.expectWorkExpList"
                      multiple
                      placeholder="不限制，都匹配"
                      @change="(value) => gtagRenderer('expect_work_exp_list_changed', { value })"
                    >
                      <template v-for="op in conditions.experienceList" :key="op.code">
                        <el-option
                          v-if="!!op.code"
                          :label="op.name"
                          :value="op.name"
                          :disabled="op.code === 108 || op.name === '在校生'"
                        >
                          {{ op.name }}</el-option
                        >
                      </template>
                    </el-select>
                  </div>
                </el-form-item>
                <div
                  v-if="formContent.expectWorkExpList?.length"
                  :style="{
                    width: '400px',
                    borderLeft: '1px solid #f0f0f0',
                    paddingLeft: '10px',
                    flex: `0 0 auto`
                  }"
                >
                  <el-form-item
                    mb10px
                    :style="{
                      width: '100%'
                    }"
                  >
                    <div font-size-12px>当前工作经验不匹配时：</div>
                    <el-select
                      v-model="formContent.expectWorkExpNotMatchStrategy"
                      @change="
                        (value) => gtagRenderer('expect_we_not_match_strategy_changed', { value })
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
                      ].includes(formContent.expectWorkExpNotMatchStrategy)
                    "
                    mb0
                    :style="{
                      width: '100%'
                    }"
                  >
                    <div font-size-12px>标记不合适针对的职位范围：</div>
                    <el-select
                      v-model="formContent.strategyScopeOptionWhenMarkJobWorkExpNotMatch"
                      @change="
                        (value) => gtagRenderer('strategy_scope_option_wmjwenm_changed', { value })
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
            </div>
            <el-form-item mb0 mt20px>
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
                      ><span><QuestionFilled w-1em h-1em mr2px /></span
                      >如下各信息位置图示</el-button
                    >
                  </el-tooltip>
                </div>
                <div>
                  <el-dropdown
                    v-if="!formContent.fieldsForUseCommonConfig.jobDetail"
                    ml20px
                    @command="handleExpectJobFilterTemplateClicked"
                  >
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
                  <div flex flex-items-center>
                    <el-checkbox v-model="formContent.fieldsForUseCommonConfig.jobDetail"
                      >使用在“公共职位筛选条件”中设置的值</el-checkbox
                    >
                    <el-button
                      v-if="formContent.fieldsForUseCommonConfig.jobDetail"
                      size="small"
                      ml-10px
                      @click="
                        handleClickConfigCommonJobCondition({
                          entry: 'job-detail-field'
                        })
                      "
                      >编辑公共职位筛选条件</el-button
                    >
                    <el-button
                      v-else
                      size="small"
                      ml-10px
                      @click="fillCommonConfigField('jobDetail')"
                      >填入公共职位筛选条件的值</el-button
                    >
                  </div>
                  <el-form-item
                    v-if="!formContent.fieldsForUseCommonConfig.jobDetail"
                    mb0
                    prop="expectJobNameRegExpStr"
                  >
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
                  <el-form-item v-else mb0>
                    <div font-size-12px>职位名称/类型/描述 正则匹配筛选逻辑</div>
                    <el-select
                      :model-value="commonJobConditionConfig.jobDetailRegExpMatchLogic"
                      disabled
                      inert
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
                            这个分类可以在此找到：<br />
                            <img w-400px src="../resources/job-type-source-entry.png" />
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
                    <el-form-item
                      v-if="!formContent.fieldsForUseCommonConfig.jobDetail"
                      mb0
                      prop="expectJobNameRegExpStr"
                    >
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
                    <el-form-item v-else mb0>
                      <div font-size-12px>职位名称正则（不区分大小写）</div>
                      <el-input
                        :model-value="commonJobConditionConfig.expectJobNameRegExpStr"
                        disabled
                        inert
                        type="textarea"
                        :placeholder="
                          getJobDetailRegExpMatchLogicConfig({
                            formContent: commonJobConditionConfig
                          }).inputPlaceholderText
                        "
                        :autosize="{ minRows: 2 }"
                        max-h-6lh
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
                      {{
                        getJobDetailRegExpMatchLogicConfig({
                          formContent: !formContent.fieldsForUseCommonConfig.jobDetail
                            ? formContent
                            : commonJobConditionConfig
                        }).logicText
                      }}
                    </div>
                    <el-form-item
                      v-if="!formContent.fieldsForUseCommonConfig.jobDetail"
                      mb0
                      prop="expectJobTypeRegExpStr"
                    >
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
                    <el-form-item v-else mb0>
                      <div ref="jobDetailRegExpSectionEl" font-size-12px>
                        职位类型正则（推荐填写，不区分大小写）
                      </div>
                      <el-input
                        v-model="commonJobConditionConfig.expectJobTypeRegExpStr"
                        disabled
                        inert
                        type="textarea"
                        :placeholder="
                          getJobDetailRegExpMatchLogicConfig({
                            formContent: commonJobConditionConfig
                          }).inputPlaceholderText
                        "
                        :autosize="{ minRows: 2 }"
                        max-h-6lh
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
                      {{
                        getJobDetailRegExpMatchLogicConfig({
                          formContent: !formContent.fieldsForUseCommonConfig.jobDetail
                            ? formContent
                            : commonJobConditionConfig
                        }).logicText
                      }}
                    </div>
                    <el-form-item
                      v-if="!formContent.fieldsForUseCommonConfig.jobDetail"
                      mb0
                      prop="expectJobDescRegExpStr"
                    >
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
                    <el-form-item v-else mb0>
                      <div font-size-12px>职位描述正则（不区分大小写）</div>
                      <el-input
                        :model-value="commonJobConditionConfig.expectJobDescRegExpStr"
                        disabled
                        inert
                        type="textarea"
                        :placeholder="
                          getJobDetailRegExpMatchLogicConfig({
                            formContent: commonJobConditionConfig
                          }).inputPlaceholderText
                        "
                        :autosize="{ minRows: 2 }"
                        max-h-6lh
                      />
                    </el-form-item>
                  </div>
                </div>
                <div
                  v-if="
                    !isJobDetailRegExpEmpty({
                      formContent: !formContent.fieldsForUseCommonConfig.jobDetail
                        ? formContent
                        : commonJobConditionConfig
                    })
                  "
                  :style="{
                    width: '400px',
                    borderLeft: '1px solid #f0f0f0',
                    paddingLeft: '10px',
                    flex: `0 0 auto`
                  }"
                >
                  <div class="mt10px lh-2em font-size-12px">
                    当前职位名称/类型/描述不符合投递条件时：
                  </div>
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
                </div>
                <div
                  v-else
                  :style="{
                    width: '400px',
                    borderLeft: '1px solid transparent',
                    paddingLeft: '10px',
                    flex: `0 0 auto`
                  }"
                />
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
    <div
      class="running-overlay__wrap"
      :style="{
        pointerEvents: 'none'
      }"
    >
      <RunningOverlay
        ref="runningOverlayRef"
        worker-id="geekAutoStartWithBossMain"
        :run-record-id="runRecordId"
      >
        <template #op-buttons="{ currentRunningStatus }">
          <div>
            <template v-if="currentRunningStatus === RUNNING_STATUS_ENUM.RUNNING">
              <el-button
                type="danger"
                plain
                :loading="isStopButtonLoading"
                @click="handleStopButtonClick"
                >结束任务</el-button
              >
            </template>
            <template v-else>
              <el-button
                type="primary"
                @click="
                  () => {
                    runningOverlayRef?.hide?.()
                  }
                "
                >关闭</el-button
              >
            </template>
          </div>
        </template>
      </RunningOverlay>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, nextTick, onUnmounted } from 'vue'
import { ElForm, ElMessage } from 'element-plus'
import { QuestionFilled, ArrowDown } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import AnyCombineBossRecommendFilter from '@renderer/features/AnyCombineBossRecommendFilter/index.vue'
import StaticCombineBossRecommendFilter from '@renderer/features/StaticCombineBossRecommendFilter/index.vue'
import { activeDescList } from '@geekgeekrun/geek-auto-start-chat-with-boss/constant.mjs'
import {
  calculateTotalCombinations,
  checkAnyCombineBossRecommendFilterHasCondition,
  formatStaticCombineFilters
} from '@geekgeekrun/geek-auto-start-chat-with-boss/combineCalculator.mjs'
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'
import {
  CombineRecommendJobFilterType,
  MarkAsNotSuitOp,
  StrategyScopeOptionWhenMarkJobNotMatch,
  SalaryCalculateWay,
  JobDetailRegExpMatchLogic
} from '@geekgeekrun/sqlite-plugin/src/enums'
import { debounce } from 'lodash'
import mittBus from '../../../utils/mitt'
import CityChooser from './components/CityChooser.vue'
import conditions from '@geekgeekrun/geek-auto-start-chat-with-boss/internal-config/job-filter-conditions-20241002.json'
import JobSourceDragOrderer from '../../../features/JobSourceDragOrderer/index.vue'
import expectJobFilterTemplateList from './expectJobFilterTemplateList'
import RunningOverlay from '@renderer/features/RunningOverlay/index.vue'
import { RUNNING_STATUS_ENUM } from '../../../../../common/enums/auto-start-chat'
import {
  getJobDetailRegExpMatchLogicConfig,
  isJobDetailRegExpEmpty,
  expectSalaryCalculateWayOption,
  ensureSalaryRangeCorrect,
  getRuleOfExpectJobNameRegExpStr,
  getRuleOfExpectJobDescRegExpStr,
  getRuleOfBlockCompanyNameRegExpStr,
  expectCompanyTemplateList,
  blockCompanyNameRegExpTemplateList,
  getHandlerForExpectCompanyTemplateClicked,
  getHandlerForExpectJobFilterTemplateClicked,
  getHandlerForBlockCompanyNameRegExpTemplateClicked,
  getRuleOfExpectJobTypeRegExpStr,
  jobDetailRegExpMatchLogicOptions,
  getHandlerForExpectSalaryCalculateWayChanged,
  normalizeCommaSplittedStr
} from './common'
const { ipcRenderer } = window.electron
const gtagRenderer = (name, params?: object) => {
  return baseGtagRenderer(name, {
    scene: 'gascwb-config',
    ...params
  })
}

const router = useRouter()

const formContent = ref({
  dingtalkRobotAccessToken: '',
  expectCompanies: '',
  anyCombineRecommendJobFilter: {},
  combineRecommendJobFilterType: 1,
  staticCombineRecommendJobFilterConditions: [],
  expectJobNameRegExpStr: '',
  expectJobTypeRegExpStr: '',
  expectJobDescRegExpStr: '',
  jobNotMatchStrategy: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
  jobNotActiveStrategy: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
  markAsNotActiveSelectedTimeRange: 7,
  // city
  expectCityList: [],
  expectCityNotMatchStrategy: MarkAsNotSuitOp.NO_OP,
  strategyScopeOptionWhenMarkJobCityNotMatch:
    StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB,
  // salary
  expectSalaryCalculateWay: SalaryCalculateWay.MONTH_SALARY,
  expectSalaryNotMatchStrategy: MarkAsNotSuitOp.NO_OP,
  strategyScopeOptionWhenMarkSalaryNotMatch:
    StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB,
  expectSalaryLow: null,
  expectSalaryHigh: null,
  // work exp
  expectWorkExpList: [],
  expectWorkExpNotMatchStrategy: MarkAsNotSuitOp.NO_OP,
  strategyScopeOptionWhenMarkJobWorkExpNotMatch:
    StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB,
  jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.EVERY,

  isSkipEmptyConditionForCombineRecommendJobFilter: false,
  __jobSourceList: formatJobSourceConfigToFormValue([
    {
      type: 'expect',
      enabled: true
    }
  ]),
  isSageTimeEnabled: true,
  sageTimeOpTimes: 100,
  sageTimePauseMinute: 15,
  blockCompanyNameRegExpStr: '',
  blockCompanyNameRegMatchStrategy: MarkAsNotSuitOp.NO_OP,
  fieldsForUseCommonConfig: {}
})

const anyCombineBossRecommendFilterHasCondition = computed(() => {
  return checkAnyCombineBossRecommendFilterHasCondition(
    formContent.value.anyCombineRecommendJobFilter
  )
})

const currentAnyCombineRecommendJobFilterCombinationCount = computed(() => {
  if (
    formContent.value.combineRecommendJobFilterType === CombineRecommendJobFilterType.STATIC_COMBINE
  ) {
    if (!formContent.value.staticCombineRecommendJobFilterConditions?.length) {
      return 1
    }
    return formatStaticCombineFilters(
      formContent.value.staticCombineRecommendJobFilterConditions
    )?.filter(Boolean).length
  }
  return calculateTotalCombinations(
    formContent.value.anyCombineRecommendJobFilter,
    anyCombineBossRecommendFilterHasCondition.value
      ? !formContent.value.isSkipEmptyConditionForCombineRecommendJobFilter
      : true
  )
})
watch(
  () => currentAnyCombineRecommendJobFilterCombinationCount.value,
  (v) => {
    const allCountMap = {}
    Object.entries(formContent.value.anyCombineRecommendJobFilter).forEach(([k, v]) => {
      allCountMap[k + 'Length'] = v?.length
    })
    gtagRenderer('any_combine_rjfc_count', {
      combinedAllCount: v,
      ...allCountMap
    })
  }
)

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
  formContent.value.combineRecommendJobFilterType =
    res.config['boss.json']?.combineRecommendJobFilterType ?? 1
  formContent.value.staticCombineRecommendJobFilterConditions = res.config['boss.json']
    ?.staticCombineRecommendJobFilterConditions?.length
    ? res.config['boss.json'].staticCombineRecommendJobFilterConditions
    : []
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

  // city
  formContent.value.expectCityList = res.config['boss.json']?.expectCityList ?? []
  formContent.value.expectCityNotMatchStrategy = strategyOptionWhenCurrentJobNotMatch
    .map((it) => it.value)
    .includes(res.config['boss.json'].expectCityNotMatchStrategy)
    ? res.config['boss.json'].expectCityNotMatchStrategy
    : MarkAsNotSuitOp.NO_OP
  formContent.value.strategyScopeOptionWhenMarkJobCityNotMatch =
    res.config['boss.json']?.strategyScopeOptionWhenMarkJobCityNotMatch ??
    StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

  // salary
  formContent.value.expectSalaryCalculateWay =
    res.config['boss.json'].expectSalaryCalculateWay ?? SalaryCalculateWay.MONTH_SALARY
  formContent.value.expectSalaryNotMatchStrategy =
    res.config['boss.json'].expectSalaryNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
  formContent.value.strategyScopeOptionWhenMarkSalaryNotMatch =
    res.config['boss.json'].strategyScopeOptionWhenMarkSalaryNotMatch ??
    StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB
  formContent.value.expectSalaryLow = parseFloat(res.config['boss.json'].expectSalaryLow) || null
  formContent.value.expectSalaryHigh = parseFloat(res.config['boss.json'].expectSalaryHigh) || null
  ensureSalaryRangeCorrect({ formContent })

  // work exp
  formContent.value.expectWorkExpList =
    Array.isArray(res.config['boss.json'].expectWorkExpList) &&
    res.config['boss.json'].expectWorkExpList.length
      ? res.config['boss.json'].expectWorkExpList
      : []
  const s = new Set([...(formContent.value?.expectWorkExpList ?? [])])
  s.delete('在校生')
  formContent.value.expectWorkExpList = [...s]
  formContent.value.expectWorkExpNotMatchStrategy =
    res.config['boss.json'].expectWorkExpNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
  formContent.value.strategyScopeOptionWhenMarkJobWorkExpNotMatch =
    res.config['boss.json'].strategyScopeOptionWhenMarkJobWorkExpNotMatch ??
    StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB
  formContent.value.jobDetailRegExpMatchLogic =
    res.config['boss.json'].jobDetailRegExpMatchLogic ?? JobDetailRegExpMatchLogic.EVERY
  formContent.value.isSkipEmptyConditionForCombineRecommendJobFilter =
    res.config['boss.json'].isSkipEmptyConditionForCombineRecommendJobFilter ?? false
  formContent.value.__jobSourceList = formatJobSourceConfigToFormValue(
    res.config['boss.json'].jobSourceList || []
  )
  formContent.value.isSageTimeEnabled = res.config['boss.json'].isSageTimeEnabled ?? true
  formContent.value.sageTimeOpTimes =
    isNaN(parseInt(res.config['boss.json'].sageTimeOpTimes)) ||
    parseInt(res.config['boss.json'].sageTimeOpTimes) < 1
      ? 100
      : parseInt(res.config['boss.json'].sageTimeOpTimes)
  formContent.value.sageTimePauseMinute =
    isNaN(parseFloat(res.config['boss.json'].sageTimePauseMinute)) ||
    parseFloat(res.config['boss.json'].sageTimePauseMinute) < 0
      ? 15
      : parseFloat(res.config['boss.json'].sageTimePauseMinute)
  formContent.value.blockCompanyNameRegExpStr =
    res.config['boss.json'].blockCompanyNameRegExpStr?.trim() ?? ''
  formContent.value.blockCompanyNameRegMatchStrategy =
    res.config['boss.json'].blockCompanyNameRegMatchStrategy ?? MarkAsNotSuitOp.NO_OP
  formContent.value.fieldsForUseCommonConfig =
    res.config['boss.json']?.fieldsForUseCommonConfig ?? {}

  commonJobConditionConfig.value = {
    expectJobNameRegExpStr:
      res.config['common-job-condition-config.json']?.expectJobNameRegExpStr ?? '',
    expectJobTypeRegExpStr:
      res.config['common-job-condition-config.json']?.expectJobTypeRegExpStr ?? '',
    expectJobDescRegExpStr:
      res.config['common-job-condition-config.json']?.expectJobDescRegExpStr ?? '',
    jobDetailRegExpMatchLogic:
      res.config['common-job-condition-config.json']?.jobDetailRegExpMatchLogic ??
      JobDetailRegExpMatchLogic.EVERY,
    expectCompanies: (res.config['common-job-condition-config.json']?.expectCompanies ?? []).join(
      ','
    ),
    blockCompanyNameRegExpStr:
      res.config['common-job-condition-config.json']?.blockCompanyNameRegExpStr ?? '',
    expectSalaryCalculateWay:
      res.config['common-job-condition-config.json']?.expectSalaryCalculateWay ??
      SalaryCalculateWay.MONTH_SALARY,
    expectSalaryLow: res.config['common-job-condition-config.json']?.expectSalaryLow ?? null,
    expectSalaryHigh: res.config['common-job-condition-config.json']?.expectSalaryHigh ?? null,
    expectCityList: res.config['common-job-condition-config.json']?.expectCityList ?? []
  }
})

const jobSourceFormItemSectionEl = ref()
const jobDetailRegExpSectionEl = ref()
const blockCompanyNameRegExpSectionEl = ref()
const formRules = {
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
  __jobSourceList: {
    trigger: null,
    validator(_, value, cb) {
      if (!Array.isArray(value)) {
        cb()
        return
      }
      if (value.every((it) => !it.enabled)) {
        cb(new Error(`将上方任一来源设置为“启用”后才能继续`))
        return
      }
      const configMap = {}
      for (const config of value) {
        if (configMap[config.type]) {
          continue
        }
        configMap[config.type] = config
      }
      if (
        !configMap.expect.enabled &&
        !configMap.recommend.enabled &&
        configMap.search.enabled &&
        !configMap.search?.children?.some((it) => it.enabled && it.keyword?.trim())
      ) {
        cb(new Error(`将上方任一来源设置为“启用”后才能继续`))
        jobSourceFormItemSectionEl.value?.scrollIntoViewIfNeeded()
        return
      }
      cb()
    }
  },
  sageTimeOpTimes: {
    validator(_, value, cb) {
      if (!formContent.value.isSageTimeEnabled) {
        cb()
        return
      }
      if (value < 1 || isNaN(parseInt(value))) {
        cb(new Error(`最小值为1，请重试`))
        return
      }
      cb()
    }
  },
  sageTimePauseMinute: {
    validator(_, value, cb) {
      if (!formContent.value.isSageTimeEnabled) {
        cb()
        return
      }
      if (value < 0 || isNaN(parseFloat(value))) {
        cb(new Error(`最小值为0，请重试`))
        return
      }
      cb()
    }
  },
  blockCompanyNameRegExpStr: {
    trigger: 'blur',
    validator: getRuleOfBlockCompanyNameRegExpStr({ gtagRenderer, blockCompanyNameRegExpSectionEl })
  }
}

const formRef = ref<InstanceType<typeof ElForm>>()
const runRecordId = ref(null)
const runningOverlayRef = ref(null)
const handleSubmit = async () => {
  gtagRenderer('save_config_and_launch_clicked', {
    has_dingtalk_robot_token: !!formContent.value?.dingtalkRobotAccessToken,
    expect_job_name_reg_exp_str: formContent.value?.expectJobNameRegExpStr,
    expect_job_type_reg_exp_str: formContent.value?.expectJobTypeRegExpStr,
    expect_job_desc_reg_exp_str: formContent.value?.expectJobDescRegExpStr,
    crjf_type: formContent.value?.combineRecommendJobFilterType,
    crjf_cc: currentAnyCombineRecommendJobFilterCombinationCount.value?.toLocaleString?.(),
    sage_t_config: JSON.stringify({
      isEnabled: formContent.value.isSageTimeEnabled,
      pauseMinute: formContent.value.sageTimePauseMinute,
      opTimes: formContent.value.sageTimeOpTimes
    })
  })
  // remove the obsolete filter - expectJobRegExpStr
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
  const clonedFormContent = JSON.parse(JSON.stringify(formContent.value))
  clonedFormContent.jobSourceList = formatJobSourceFormValueToConfig(
    clonedFormContent.__jobSourceList
  )
  delete clonedFormContent.__jobSourceList
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(clonedFormContent))
  mittBus.emit('auto-start-chat-with-boss-config-saved')
  gtagRenderer('config_saved_and_launch_auto_start_chat', {
    has_dingtalk_robot_token: !!formContent.value?.dingtalkRobotAccessToken
  })

  try {
    runningOverlayRef.value?.show()
    const { runRecordId: rrId } = await electron.ipcRenderer.invoke(
      'run-geek-auto-start-chat-with-boss'
    )
    runRecordId.value = rrId
  } catch (err) {
    if (err instanceof Error && err.message.includes('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')) {
      gtagRenderer('gascwb_cannot_run_for_corrupt')
      ElMessage.error({
        message: `核心组件损坏，正在尝试修复`
      })
      router.replace('/')
    }
    console.error(err)
    gtagRenderer('gascwb_cannot_run_for_unknown_error', { err })
  }

  // {
  //   path: '/geekAutoStartChatWithBoss/prepareRun',
  //   query: { flow: 'geek-auto-start-chat-with-boss' }
  // }
}
const handleSave = async () => {
  gtagRenderer('save_config_clicked', {
    has_dingtalk_robot_token: !!formContent.value?.dingtalkRobotAccessToken,
    expect_job_name_reg_exp_str: formContent.value?.expectJobNameRegExpStr,
    expect_job_type_reg_exp_str: formContent.value?.expectJobTypeRegExpStr,
    expect_job_desc_reg_exp_str: formContent.value?.expectJobDescRegExpStr,
    crjf_type: formContent.value?.combineRecommendJobFilterType,
    crjf_cc: currentAnyCombineRecommendJobFilterCombinationCount.value?.toLocaleString?.(),
    sage_t_config: JSON.stringify({
      isEnabled: formContent.value.isSageTimeEnabled,
      pauseMinute: formContent.value.sageTimePauseMinute,
      opTimes: formContent.value.sageTimeOpTimes
    })
  })
  formContent.value.expectCompanies = normalizeCommaSplittedStr(formContent.value.expectCompanies)
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
  const clonedFormContent = JSON.parse(JSON.stringify(formContent.value))
  clonedFormContent.jobSourceList = formatJobSourceFormValueToConfig(
    clonedFormContent.__jobSourceList
  )
  delete clonedFormContent.__jobSourceList
  await electron.ipcRenderer.invoke('save-config-file-from-ui', JSON.stringify(clonedFormContent))
  mittBus.emit('auto-start-chat-with-boss-config-saved')
  ElMessage.success('配置保存成功')
  gtagRenderer('config_saved')
}

const handleExpectCompanyTemplateClicked = getHandlerForExpectCompanyTemplateClicked({
  gtagRenderer,
  formContent
})

const handleExpectJobFilterTemplateClicked = getHandlerForExpectJobFilterTemplateClicked({
  gtagRenderer,
  formContent
})

const strategyOptionWhenCurrentJobNotMatch = [
  {
    name: '在BOSS直聘上标记不合适（推荐，这确保BOSS直聘推荐新职位来置换不合适职位）',
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
    name: '仅和“期望投递公司”匹配的职位',
    value: StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB
  }
]

const handleExpectSalaryCalculateWayChanged = getHandlerForExpectSalaryCalculateWayChanged({
  gtagRenderer,
  formContent
})

const salaryMarkAsNotSuitLabelText = computed(() => {
  const textSeg = []
  const formContentToUse = !formContent.value.fieldsForUseCommonConfig.salary
    ? formContent.value
    : commonJobConditionConfig.value
  if (formContentToUse.expectSalaryLow) {
    textSeg.push('低于期望薪资下限')
  }
  if (formContentToUse.expectSalaryHigh) {
    textSeg.push('高于期望薪资上限')
  }
  return textSeg.join(' / ')
})

const isShowSalaryMarkAsNotSuitStrategy = computed(() => {
  const formContentToUse = !formContent.value.fieldsForUseCommonConfig.salary
    ? formContent.value
    : commonJobConditionConfig.value
  let flag = formContentToUse.expectSalaryHigh || formContentToUse.expectSalaryLow

  if (
    formContentToUse.expectSalaryHigh &&
    formContentToUse.expectSalaryLow &&
    formContentToUse.expectSalaryHigh < formContentToUse.expectSalaryLow
  ) {
    flag = false
  }

  return flag
})

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

function handleHowToFillDetailFilterClick() {
  gtagRenderer('click_linux_do_how_to_fill_df')
  electron.ipcRenderer.send(
    'open-external-link',
    'https://linux.do/t/topic/640626/74?u=geekgeekrun'
  )
}

function formatJobSourceConfigToFormValue(config = []) {
  const typeToNameKey = {
    recommend: '推荐列表中的职位',
    expect: '根据设置的求职期望推荐的职位',
    search: '通过搜索找到的职位'
  }
  const isInitEmpty = !config?.length
  config = config.filter((it) => Object.hasOwn(typeToNameKey, it.type))

  const addedSet = new Set()
  const tempArr = []
  config.forEach((it) => {
    if (!Object.hasOwn(typeToNameKey, it.type)) {
      return
    }
    tempArr.push(it)
    addedSet.add(it.type)
  })
  config = tempArr
  Object.keys(typeToNameKey).forEach((k) => {
    if (addedSet.has(k)) {
      return
    }
    // handle init value
    tempArr.push({
      type: k,
      enabled: isInitEmpty && k === 'expect'
    })
    addedSet.add(k)
  })

  return config.map((outerItem) => {
    return {
      ...outerItem,
      label: typeToNameKey[outerItem.type]
    }
  })
}

function formatJobSourceFormValueToConfig(formValue = []) {
  return formValue.map((it) => {
    it = { ...it }
    delete it.label
    return it
  })
}

const combineRecommendJobFilterTypeOptions = [
  {
    name: '使用自由组合条件进行遍历',
    value: 1
  },
  {
    name: '使用固定组合条件进行遍历',
    value: 2
  }
]

const needToCheckRuntimeDependenciesHandler = () => {
  router.replace('/')
}
electron.ipcRenderer.on('need-to-check-runtime-dependencies', needToCheckRuntimeDependenciesHandler)
onUnmounted(() => {
  electron.ipcRenderer.removeListener(
    'need-to-check-runtime-dependencies',
    needToCheckRuntimeDependenciesHandler
  )
})

const isStopButtonLoading = ref(false)
const handleStopButtonClick = async () => {
  gtagRenderer('gascwb_stop_button_clicked')
  isStopButtonLoading.value = true
  try {
    await electron.ipcRenderer.invoke('stop-geek-auto-start-chat-with-boss')
    runningOverlayRef.value?.hide()
  } finally {
    isStopButtonLoading.value = false
  }
}

const handleBlockCompanyNameRegExpTemplateClicked =
  getHandlerForBlockCompanyNameRegExpTemplateClicked({
    gtagRenderer,
    formContent
  })

const commonJobConditionConfig = ref({})
const unListenCommonJobConditionConfig = ipcRenderer.on(
  'common-job-condition-config-updated',
  (_, { config }) => {
    commonJobConditionConfig.value = {
      ...config,
      expectCompanies: config?.expectCompanies?.map((it) => it.trim())?.join(',') ?? ''
    }
  }
)
onUnmounted(() => {
  unListenCommonJobConditionConfig()
})

const handleClickConfigCommonJobCondition = async ({ entry }) => {
  gtagRenderer('config_cjc_clicked', { entry })
  try {
    await electron.ipcRenderer.invoke('common-job-condition-config')
  } catch (err) {
    console.log(err)
  }
}

const fillCommonConfigField = (field) => {
  gtagRenderer('fill_common_config_field_clicked', { field })
  let fieldsToReplace = []
  switch (field) {
    case 'salary': {
      fieldsToReplace = ['expectSalaryCalculateWay', 'expectSalaryLow', 'expectSalaryHigh']
      break
    }
    case 'city': {
      fieldsToReplace = ['expectCityList']
      break
    }
    case 'jobDetail': {
      fieldsToReplace = [
        'jobDetailRegExpMatchLogic',
        'expectJobNameRegExpStr',
        'expectJobTypeRegExpStr',
        'expectJobDescRegExpStr'
      ]
      break
    }
    case 'expectCompanies': {
      fieldsToReplace = ['expectCompanies']
      break
    }
    case 'blockCompanyNameRegExpStr': {
      fieldsToReplace = ['blockCompanyNameRegExpStr']
      break
    }
  }
  for (const field of fieldsToReplace) {
    let sourceValue = commonJobConditionConfig.value[field]
    if (
      commonJobConditionConfig.value[field] &&
      typeof commonJobConditionConfig.value[field] === 'object'
    ) {
      sourceValue = JSON.parse(JSON.stringify(commonJobConditionConfig.value[field]))
    }
    formContent.value[field] = sourceValue
  }
}
</script>

<style scoped lang="scss">
.geek-auto-start-run-with-boss__wrap {
  position: relative;
  .main__wrap {
    position: relative;
    z-index: 0;
    max-height: 100vh;
    .form-wrap {
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
  }
}
</style>

<style lang="scss">
.form-wrap.geek-auto-start-run-with-boss {
  .el-form-item__error.el-form-item__error {
    font-size: 12px;
    line-height: 1.2em;
  }
  .job-detail-filter-wrap .el-form-item__error,
  .block-company-filter-wrap .el-form-item__error {
    position: static;
    word-break: break-word;
  }
  .job-source-form-item {
    margin-bottom: 0;
    .job-source-drag-orderer {
      margin-top: 10px;
      background-color: #fff;
      padding: 20px;
      border: 1px solid var(--el-card-border-color);
      border-radius: 4px;
    }
    &.is-error {
      margin-bottom: 18px;
      .el-input__wrapper {
        box-shadow: 0 0 0 1px var(--el-border-color) inset;
      }
      .job-source-drag-orderer {
        background-color: var(--el-color-danger-light-9);
        border: 1px solid var(--el-color-danger);
      }
    }
  }
}

.running-overlay__wrap {
  position: absolute;
  inset: 0;
}
</style>
