<template>
  <div class="boss-job-config__wrap">
    <div class="main__wrap">
      <!-- 顶部工具栏 -->
      <div class="toolbar">
        <el-button :loading="isSyncing" @click="handleSync">同步职位列表</el-button>
        <el-text v-if="jobsList.length" type="info" size="small">
          共 {{ jobsList.length }} 个职位，点击职位名称展开配置
        </el-text>
      </div>

      <el-empty v-if="!jobsList.length" description="暂无职位，请先同步" />

      <!-- 职位列表，每个展开为完整配置表单 -->
      <el-collapse v-else v-model="activeJobIds" class="job-collapse">
        <el-collapse-item v-for="job in jobsList" :key="job.jobId" :name="job.jobId">
          <template #title>
            <span class="collapse-title">{{ job.jobName }}</span>
            <el-button
              size="small"
              text
              class="copy-btn"
              @click.stop="openCopyDialog(job)"
            >从其他职位复制</el-button>
          </template>

          <el-form :model="job" label-position="top" class="job-form">
            <!-- ── 两页通用筛选 ── -->
            <div class="section-label">
              <span>候选人筛选条件</span>
              <el-tag size="small">推荐牛人页 + 沟通页</el-tag>
            </div>

            <div class="filter-row">
              <el-checkbox v-model="job.filter.expectCityEnabled" />
              <el-form-item label="期望城市" class="flex-1">
                <el-input
                  v-model="job.filter.expectCityListStr"
                  :disabled="!job.filter.expectCityEnabled"
                  placeholder="多个用逗号分隔，例如：北京,上海"
                  @blur="
                    job.filter.expectCityListStr = normalizeCommaSplittedStr(
                      job.filter.expectCityListStr
                    )
                  "
                />
              </el-form-item>
            </div>

            <div class="filter-row">
              <el-checkbox v-model="job.filter.expectEducationEnabled" />
              <el-form-item label="学历要求（正则）" class="flex-1">
                <el-input
                  v-model="job.filter.expectEducationRegExpStr"
                  :disabled="!job.filter.expectEducationEnabled"
                  placeholder="正则表达式，例如：本科|硕士|博士"
                />
                <div class="quick-fill-bar">
                  <span class="quick-fill-label">快捷填充：</span>
                  <el-button
                    v-for="preset in educationPresets"
                    :key="preset.label"
                    size="small"
                    text
                    :disabled="!job.filter.expectEducationEnabled"
                    @click="job.filter.expectEducationRegExpStr = preset.value"
                  >{{ preset.label }}</el-button>
                </div>
              </el-form-item>
            </div>

            <div class="filter-row">
              <el-checkbox v-model="job.filter.expectWorkExpMinEnabled" />
              <el-form-item label="工作经验下限（年）" class="flex-1">
                <el-input-number
                  v-model="job.filter.expectWorkExpRange[0]"
                  :min="0"
                  controls-position="right"
                  :disabled="!job.filter.expectWorkExpMinEnabled"
                  placeholder="最少"
                />
              </el-form-item>
            </div>

            <div class="filter-row">
              <el-checkbox v-model="job.filter.expectWorkExpMaxEnabled" />
              <el-form-item label="工作经验上限（年）" class="flex-1">
                <el-input-number
                  v-model="job.filter.expectWorkExpRange[1]"
                  :min="0"
                  controls-position="right"
                  :disabled="!job.filter.expectWorkExpMaxEnabled"
                  placeholder="最多（99=不限）"
                />
              </el-form-item>
            </div>

            <div class="filter-row">
              <el-checkbox v-model="job.filter.expectSalaryMinEnabled" />
              <el-form-item label="期望薪资下限（K/月）" class="flex-1">
                <el-input-number
                  v-model="job.filter.expectSalaryRange[0]"
                  :min="0"
                  controls-position="right"
                  :disabled="!job.filter.expectSalaryMinEnabled"
                  placeholder="最低（0=不限）"
                />
                <div class="form-tip">填 8 表示 8K；填 8000 表示 8000 元/月（会自动换算成 8K）</div>
              </el-form-item>
            </div>

            <div class="filter-row">
              <el-checkbox v-model="job.filter.expectSalaryMaxEnabled" />
              <el-form-item label="期望薪资上限（K/月）" class="flex-1">
                <el-input-number
                  v-model="job.filter.expectSalaryRange[1]"
                  :min="0"
                  controls-position="right"
                  :disabled="!job.filter.expectSalaryMaxEnabled"
                  placeholder="最高（0=不限）"
                />
              </el-form-item>
            </div>

            <div class="filter-row">
              <el-checkbox style="visibility: hidden" />
              <el-form-item label="薪资为「面议」时" class="flex-1">
                <el-select
                  v-model="job.filter.expectSalaryWhenNegotiable"
                  :disabled="!job.filter.expectSalaryMinEnabled && !job.filter.expectSalaryMaxEnabled"
                  style="width: 100%"
                >
                  <el-option value="exclude" label="不通过（排除）" />
                  <el-option value="include" label="通过（不因薪资排除）" />
                </el-select>
              </el-form-item>
            </div>

            <!-- ── 沟通页专属 ── -->
            <div class="section-label">
              <span>简历全文筛选</span>
              <el-tag size="small" type="success">仅沟通页</el-tag>
            </div>

            <div class="form-tip resume-filter-tip">勾选一个或多个筛选模块；全部不勾选则不筛选</div>

            <div class="filter-row resume-module-row">
              <el-checkbox v-model="job.filter.resumeKeywordsEnabled" label="关键词匹配" />
            </div>
            <el-form-item
              v-if="job.filter.resumeKeywordsEnabled"
              label="关键词列表（含任一即通过）"
              class="resume-module-content"
            >
              <el-input
                v-model="job.filter.resumeKeywordsStr"
                placeholder="多个用逗号分隔，例如：Python,机器学习"
                @blur="
                  job.filter.resumeKeywordsStr = normalizeCommaSplittedStr(
                    job.filter.resumeKeywordsStr
                  )
                "
              />
            </el-form-item>

            <div class="filter-row resume-module-row">
              <el-checkbox v-model="job.filter.resumeRegExpEnabled" label="正则表达式匹配" />
            </div>
            <el-form-item
              v-if="job.filter.resumeRegExpEnabled"
              label="正则表达式（匹配即通过）"
              class="resume-module-content"
            >
              <el-input
                v-model="job.filter.resumeRegExpStr"
                placeholder="正则表达式，例如：Python.{0,20}(3年|三年)"
              />
            </el-form-item>

            <div class="filter-row resume-module-row">
              <el-checkbox v-model="job.filter.resumeLlmEnabled" label="大模型筛选（AI Rubric）" />
            </div>
              <div v-if="job.filter.resumeLlmEnabled" class="resume-module-content llm-rubric-panel">
              <!-- Step 1: AI Rubric Builder -->
              <div class="rubric-step">
                <div class="rubric-step-label">Step 1：智能生成</div>
                  <el-form-item label="模型（用于生成评分标准）" style="margin-bottom: 8px">
                    <el-select
                      v-model="job.filter.resumeLlmConfig.rubricGenerationModelId"
                      placeholder="默认：按 boss-llm.json 的 purpose/默认模型选择"
                      clearable
                      filterable
                      style="width: 100%"
                      :loading="bossLlmModelsLoading"
                    >
                      <el-option
                        v-for="m in bossLlmEnabledModels"
                        :key="m.id"
                        :label="m.label"
                        :value="m.id"
                      />
                    </el-select>
                    <el-alert
                      v-if="!bossLlmModelsLoading && bossLlmEnabledModels.length === 0"
                      type="warning"
                      show-icon
                      :closable="false"
                      title="未检测到可用模型：请先到「招聘端大语言模型配置」添加并启用至少一个模型"
                      style="margin-top: 8px"
                    />
                    <div class="form-tip">
                      不选则使用默认模型；可在「招聘端 LLM 配置」里设置 purposeDefaultModelId.rubric_generation。
                    </div>
                  </el-form-item>
                <el-input
                  v-model="job.filter.resumeLlmConfig.sourceJd"
                  type="textarea"
                  :autosize="{ minRows: 3 }"
                  placeholder="粘贴岗位描述（JD）、招聘要求或标杆简历片段..."
                />
                <div class="generate-bar">
                  <el-button
                    :loading="job._generatingRubric"
                    type="primary"
                    plain
                    @click="handleGenerateRubric(job)"
                  >
                    ✨ 自动生成评分标准
                  </el-button>
                  <el-button
                    plain
                    :disabled="!job.filter.resumeLlmConfig.sourceJd.trim()"
                    @click="handleCopyRubricPrompt(job)"
                  >
                    复制 Prompt
                  </el-button>
                </div>
              </div>
              <!-- JSON 导入区 -->
              <div class="rubric-step rubric-import-step">
                <div class="rubric-step-label">
                  手动导入 JSON
                  <span class="rubric-step-sublabel">（从外部 LLM 获取 JSON 后粘贴到此处）</span>
                </div>
                <el-input
                  v-model="job._rubricJsonImport"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 6 }"
                  placeholder='{"knockouts":[...],"dimensions":[...]}'
                />
                <el-button
                  size="small"
                  plain
                  style="margin-top: 6px"
                  :disabled="!job._rubricJsonImport"
                  @click="handleImportRubricJson(job)"
                >
                  应用 JSON
                </el-button>
              </div>

              <!-- Step 2: Visual Rubric Editor -->
              <div v-if="hasRubric(job)" class="rubric-step">
                <div class="rubric-step-label">Step 2：微调评分标准</div>
                <div class="rubric-editor">
                  <div class="rubric-block">
                    <span class="rubric-block-title">一票否决项</span>
                    <div class="knockout-tags">
                      <el-tag
                        v-for="(item, idx) in job.filter.resumeLlmConfig.rubric.knockouts"
                        :key="idx"
                        closable
                        @close="job.filter.resumeLlmConfig.rubric.knockouts.splice(idx, 1)"
                      >
                        {{ item }}
                      </el-tag>
                      <el-button size="small" text @click="addKnockout(job)">+ 添加</el-button>
                    </div>
                  </div>
                  <div class="rubric-block">
                    <span class="rubric-block-title">评分维度</span>
                    <div class="dimensions-list">
                      <el-card
                        v-for="(dim, idx) in job.filter.resumeLlmConfig.rubric.dimensions"
                        :key="idx"
                        shadow="never"
                        class="dimension-card"
                      >
                        <div class="dimension-header">
                          <el-input
                            v-model="dim.name"
                            placeholder="维度名称"
                            size="small"
                            class="dimension-name"
                          />
                          <el-slider
                            v-model="dim.weight"
                            :min="0"
                            :max="100"
                            :show-tooltip="true"
                            class="dimension-weight"
                          />
                          <span class="weight-label">权重 {{ dim.weight }}%</span>
                          <el-button size="small" text type="danger" @click="removeDimension(job, idx)">
                            删除
                          </el-button>
                        </div>
                        <div class="dimension-criteria">
                          <div class="criteria-row">
                            <span class="criteria-score">1 分</span>
                            <el-input v-model="dim.criteria['1']" placeholder="1分标准" size="small" />
                          </div>
                          <div class="criteria-row">
                            <span class="criteria-score">3 分</span>
                            <el-input v-model="dim.criteria['3']" placeholder="3分标准" size="small" />
                          </div>
                          <div class="criteria-row">
                            <span class="criteria-score">5 分</span>
                            <el-input v-model="dim.criteria['5']" placeholder="5分标准" size="small" />
                          </div>
                        </div>
                      </el-card>
                      <el-button size="small" plain @click="addDimension(job)">+ 添加维度</el-button>
                    </div>
                  </div>
                  <div class="rubric-block pass-threshold">
                    <span class="rubric-block-title">通过分数线</span>
                    <el-slider v-model="job.filter.resumeLlmConfig.passThreshold" :min="0" :max="100" :marks="{ 0: '0', 50: '50', 75: '75', 100: '100' }" />
                    <span class="threshold-value">≥ {{ job.filter.resumeLlmConfig.passThreshold }} 分通过</span>
                  </div>
                </div>
              </div>
              <el-form-item v-else label="（旧）简单规则" class="fallback-rule">
                <el-input
                  v-model="job.filter.resumeLlmRule"
                  type="textarea"
                  :autosize="{ minRows: 2 }"
                  placeholder="或直接输入筛选描述，例如：必须有3年以上Python经验"
                />
              </el-form-item>
            </div>

            <!-- 保存按钮 -->
            <div class="job-action-bar">
              <el-button type="primary" :loading="job._saving" @click="handleSaveJob(job)">
                保存「{{ job.jobName }}」配置
              </el-button>
            </div>
          </el-form>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- 复制配置对话框 -->
    <el-dialog v-model="copyDialogVisible" title="从其他职位复制配置" width="400px">
      <el-text>将以下职位的筛选配置复制到「{{ copyTargetJob?.jobName }}」（会覆盖当前配置）：</el-text>
      <el-radio-group v-model="copySourceJobId" class="copy-source-list">
        <el-radio
          v-for="j in jobsList.filter((j) => j.jobId !== copyTargetJob?.jobId)"
          :key="j.jobId"
          :value="j.jobId"
        >{{ j.jobName }}</el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="copyDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!copySourceJobId" @click="handleCopyConfig">
          确认复制
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const { ipcRenderer } = electron

const educationPresets = [
  { label: '大专及以上', value: '大专|专科|本科|MBA|硕士|博士' },
  { label: '本科及以上', value: '本科|MBA|硕士|博士' },
  { label: '硕士及以上', value: '硕士|博士' },
  { label: '仅本科', value: '^本科$' }
]

interface RubricDimension {
  name: string
  weight: number
  criteria: Record<string, string>
}

interface ResumeLlmConfig {
  sourceJd: string
  passThreshold: number
  rubricGenerationModelId?: string | null
  rubric: { knockouts: string[]; dimensions: RubricDimension[] }
}

interface JobFilter {
  expectCityEnabled: boolean
  expectCityListStr: string
  expectEducationEnabled: boolean
  expectEducationRegExpStr: string
  expectWorkExpMinEnabled: boolean
  expectWorkExpMaxEnabled: boolean
  expectWorkExpRange: [number, number]
  expectSalaryMinEnabled: boolean
  expectSalaryMaxEnabled: boolean
  expectSalaryRange: [number, number]
  expectSalaryWhenNegotiable: 'exclude' | 'include'
  resumeKeywordsEnabled: boolean
  resumeKeywordsStr: string
  resumeRegExpEnabled: boolean
  resumeRegExpStr: string
  resumeLlmEnabled: boolean
  resumeLlmRule: string
  resumeLlmConfig: ResumeLlmConfig
}

interface JobItem {
  jobId: string
  jobName: string
  sequence: { enabled: boolean; runRecommend: boolean; runChat: boolean }
  filter: JobFilter
  _saving?: boolean
  _generatingRubric?: boolean
  _rubricJsonImport?: string
}

function defaultResumeLlmConfig(): ResumeLlmConfig {
  return {
    sourceJd: '',
    passThreshold: 75,
    rubricGenerationModelId: null,
    rubric: { knockouts: [], dimensions: [] }
  }
}

function defaultFilter(): JobFilter {
  return {
    expectCityEnabled: false,
    expectCityListStr: '',
    expectEducationEnabled: false,
    expectEducationRegExpStr: '',
    expectWorkExpMinEnabled: false,
    expectWorkExpMaxEnabled: false,
    expectWorkExpRange: [0, 99],
    expectSalaryMinEnabled: false,
    expectSalaryMaxEnabled: false,
    expectSalaryRange: [0, 0],
    expectSalaryWhenNegotiable: 'exclude',
    resumeKeywordsEnabled: false,
    resumeKeywordsStr: '',
    resumeRegExpEnabled: false,
    resumeRegExpStr: '',
    resumeLlmEnabled: false,
    resumeLlmRule: '',
    resumeLlmConfig: defaultResumeLlmConfig()
  }
}

function rawToJobItem(raw: Record<string, any>): JobItem {
  const f = raw.filter ?? {}
  return {
    jobId: raw.jobId ?? raw.id ?? '',
    jobName: raw.jobName ?? raw.name ?? '',
    sequence: raw.sequence ?? { enabled: true, runRecommend: true, runChat: true },
    filter: {
      expectCityEnabled: f.expectCityEnabled ?? false,
      expectCityListStr: Array.isArray(f.expectCityList)
        ? f.expectCityList.join(',')
        : (f.expectCityListStr ?? ''),
      expectEducationEnabled: f.expectEducationEnabled ?? false,
      expectEducationRegExpStr: f.expectEducationRegExpStr ?? '',
      expectWorkExpMinEnabled: f.expectWorkExpMinEnabled ?? false,
      expectWorkExpMaxEnabled: f.expectWorkExpMaxEnabled ?? false,
      expectWorkExpRange: f.expectWorkExpRange ?? [0, 99],
      expectSalaryMinEnabled: f.expectSalaryMinEnabled ?? false,
      expectSalaryMaxEnabled: f.expectSalaryMaxEnabled ?? false,
      expectSalaryRange: f.expectSalaryRange ?? [0, 0],
      expectSalaryWhenNegotiable:
        f.expectSalaryWhenNegotiable === 'include' ? 'include' : 'exclude',
      resumeKeywordsEnabled: f.resumeKeywordsEnabled ?? false,
      resumeKeywordsStr: Array.isArray(f.resumeKeywords)
        ? f.resumeKeywords.join(',')
        : (f.resumeKeywordsStr ?? ''),
      resumeRegExpEnabled: f.resumeRegExpEnabled ?? false,
      resumeRegExpStr: f.resumeRegExpStr ?? '',
      resumeLlmEnabled: f.resumeLlmEnabled ?? false,
      resumeLlmRule: f.resumeLlmRule ?? '',
      resumeLlmConfig: parseResumeLlmConfig(f.resumeLlmConfig)
    }
  }
}

function parseResumeLlmConfig(raw: any): ResumeLlmConfig {
  if (!raw || typeof raw !== 'object') return defaultResumeLlmConfig()
  const r = raw.rubric || {}
  const knockouts = Array.isArray(r.knockouts) ? r.knockouts.filter((k: any) => typeof k === 'string') : []
  const dimensions = (Array.isArray(r.dimensions) ? r.dimensions : []).map((d: any) => ({
    name: String(d?.name ?? ''),
    weight: typeof d?.weight === 'number' ? d.weight : 33,
    criteria: {
      '1': String(d?.criteria?.['1'] ?? d?.criteria?.[1] ?? ''),
      '3': String(d?.criteria?.['3'] ?? d?.criteria?.[3] ?? ''),
      '5': String(d?.criteria?.['5'] ?? d?.criteria?.[5] ?? '')
    }
  }))
  return {
    sourceJd: String(raw.sourceJd ?? ''),
    passThreshold: typeof raw.passThreshold === 'number' ? raw.passThreshold : 75,
    rubricGenerationModelId: typeof raw.rubricGenerationModelId === 'string' ? raw.rubricGenerationModelId : null,
    rubric: { knockouts, dimensions }
  }
}

function jobItemToRaw(job: JobItem): Record<string, any> {
  const f = job.filter
  return {
    jobId: job.jobId,
    jobName: job.jobName,
    sequence: job.sequence,
    filter: {
      expectCityEnabled: f.expectCityEnabled,
      expectCityList: strToList(f.expectCityListStr),
      expectEducationEnabled: f.expectEducationEnabled,
      expectEducationRegExpStr: f.expectEducationRegExpStr,
      expectWorkExpMinEnabled: f.expectWorkExpMinEnabled,
      expectWorkExpMaxEnabled: f.expectWorkExpMaxEnabled,
      expectWorkExpRange: f.expectWorkExpRange,
      expectSalaryMinEnabled: f.expectSalaryMinEnabled,
      expectSalaryMaxEnabled: f.expectSalaryMaxEnabled,
      expectSalaryRange: f.expectSalaryRange,
      expectSalaryWhenNegotiable: f.expectSalaryWhenNegotiable,
      resumeKeywordsEnabled: f.resumeKeywordsEnabled,
      resumeKeywords: strToList(f.resumeKeywordsStr),
      resumeRegExpEnabled: f.resumeRegExpEnabled,
      resumeRegExpStr: f.resumeRegExpStr,
      resumeLlmEnabled: f.resumeLlmEnabled,
      resumeLlmRule: f.resumeLlmRule,
      resumeLlmConfig: f.resumeLlmConfig
    }
  }
}

function normalizeCommaSplittedStr(str: string): string {
  if (!str) return ''
  return str
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',')
}

function strToList(str: string): string[] {
  if (!str) return []
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const jobsList = ref<JobItem[]>([])
const activeJobIds = ref<string[]>([])
const isSyncing = ref(false)

type BossLlmModelOption = { id: string; label: string }
const bossLlmEnabledModels = ref<BossLlmModelOption[]>([])
const bossLlmModelsLoading = ref(false)

const copyDialogVisible = ref(false)
const copyTargetJob = ref<JobItem | null>(null)
const copySourceJobId = ref<string>('')

onMounted(async () => {
  try {
    const result = await ipcRenderer.invoke('fetch-boss-jobs-config')
    jobsList.value = (result?.jobs ?? []).map(rawToJobItem)
  } catch (err) {
    console.error(err)
  }

  bossLlmModelsLoading.value = true
  try {
    const llm = await ipcRenderer.invoke('boss-fetch-llm-config')
    // 新格式：providers[]；旧格式：models[]（兼容）
    const flatModels = Array.isArray(llm?.providers)
      ? llm.providers.flatMap((p: any) =>
          (p.models ?? []).map((m: any) => ({ ...m, _providerName: p.name }))
        )
      : (Array.isArray(llm?.models) ? llm.models : [])
    bossLlmEnabledModels.value = flatModels
      .filter((m: any) => m && m.enabled !== false && typeof m.id === 'string')
      .map((m: any) => ({
        id: m.id,
        label: `${m._providerName ? m._providerName + ' / ' : ''}${m.name || m.model || m.id}`
      }))
  } catch (err) {
    bossLlmEnabledModels.value = []
  } finally {
    bossLlmModelsLoading.value = false
  }
})

const handleSync = async () => {
  isSyncing.value = true
  try {
    const result = await ipcRenderer.invoke('sync-boss-job-list')
    const existing = jobsList.value
    const existingMap = new Map(existing.map((j) => [j.jobId, j]))
    jobsList.value = (result?.jobs ?? []).map((raw: Record<string, any>) => {
      const prev = existingMap.get(raw.jobId ?? raw.id)
      if (prev) return { ...prev, jobName: raw.jobName ?? raw.name ?? prev.jobName }
      return rawToJobItem(raw)
    })
    ElMessage({ type: 'success', message: '职位列表已同步' })
  } catch (err: any) {
    const msg =
      err?.message === 'NEED_LOGIN'
        ? '未登录或 Cookie 已过期，请先运行一次「推荐牛人」并完成登录后再同步职位列表'
        : err?.message === 'NO_BROWSER'
          ? '未配置浏览器，请先在设置中选择可执行浏览器'
          : err?.message === 'ACCESS_IS_DENIED'
            ? '访问被拒绝，请检查账号状态'
            : '同步失败'
    ElMessage({ type: 'error', message: msg })
    console.error(err)
  } finally {
    isSyncing.value = false
  }
}

const saveAll = async () => {
  const payload = { jobs: jobsList.value.map(jobItemToRaw) }
  await ipcRenderer.invoke('save-boss-jobs-config', JSON.stringify(payload))
}

const handleSaveJob = async (job: JobItem) => {
  job._saving = true
  try {
    await saveAll()
    ElMessage({ type: 'success', message: `「${job.jobName}」配置已保存` })
  } catch (err) {
    ElMessage({ type: 'error', message: '保存失败' })
    console.error(err)
  } finally {
    job._saving = false
  }
}

const openCopyDialog = (job: JobItem) => {
  copyTargetJob.value = job
  copySourceJobId.value = ''
  copyDialogVisible.value = true
}

const handleCopyConfig = () => {
  if (!copyTargetJob.value || !copySourceJobId.value) return
  const source = jobsList.value.find((j) => j.jobId === copySourceJobId.value)
  if (!source) return
  copyTargetJob.value.filter = JSON.parse(JSON.stringify(source.filter))
  copyDialogVisible.value = false
  ElMessage({ type: 'success', message: '配置已复制，请记得保存' })
}

function ensureResumeLlmConfig(job: JobItem) {
  if (!job.filter.resumeLlmConfig) {
    job.filter.resumeLlmConfig = defaultResumeLlmConfig()
  }
  if (!job.filter.resumeLlmConfig.rubric) {
    job.filter.resumeLlmConfig.rubric = { knockouts: [], dimensions: [] }
  }
  if (!Array.isArray(job.filter.resumeLlmConfig.rubric.knockouts)) {
    job.filter.resumeLlmConfig.rubric.knockouts = []
  }
  if (!Array.isArray(job.filter.resumeLlmConfig.rubric.dimensions)) {
    job.filter.resumeLlmConfig.rubric.dimensions = []
  }
}

function hasRubric(job: JobItem): boolean {
  const d = job.filter.resumeLlmConfig?.rubric?.dimensions
  return Array.isArray(d) && d.length > 0
}

const RUBRIC_GENERATION_PROMPT = `你是一个资深 HR，擅长将招聘需求转化为可量化的候选人评分体系（Rubric）。

请仔细阅读下方的岗位描述（JD），从中提取并生成：

1. knockouts（一票否决项）：
   - 不满足任意一项即直接淘汰
   - 数量：根据 JD 实际硬性要求决定，通常 2~4 条
   - 只写岗位明确说明的硬性条件（禁止背景、资质门槛、明确排除项等），不要臆造
   - 每条独立，简洁具体，不超过 30 字

2. dimensions（评分维度）：
   - 数量：根据 JD 核心能力要求决定，通常 3~5 个
   - 每个维度必须对应 JD 中一个独立的、具体的能力方向（如：实验操作能力、研究独立性、沟通表达能力、工具学习能力等）
   - 严禁出现「综合匹配度」「整体匹配」「岗位匹配度」等笼统无意义的维度名称
   - weight 之和必须精确等于 100
   - criteria 必须是具体的行为或成果描述，严禁使用「不符合/部分符合/完全符合」这类无意义模板：
     - "1"：候选人完全不具备该维度的能力或经验（举例说明具体缺失表现）
     - "3"：候选人具备基础能力，但深度或广度不足（举例说明具体不足之处）
     - "5"：候选人在该维度有突出表现，与岗位高度匹配（举例说明具体优秀表现）

仅以 JSON 格式回复，不要包含任何其他文字，不要有 markdown 代码块。格式：
{
  "knockouts": ["否决项1", "否决项2"],
  "dimensions": [
    {
      "name": "维度名称",
      "weight": 30,
      "criteria": {
        "1": "1分的具体行为描述",
        "3": "3分的具体行为描述",
        "5": "5分的具体行为描述"
      }
    }
  ]
}

---
以下是 JD：

`

function handleCopyRubricPrompt(job: JobItem) {
  const jd = job.filter.resumeLlmConfig?.sourceJd?.trim() || ''
  if (!jd) return
  const full = RUBRIC_GENERATION_PROMPT + jd
  navigator.clipboard.writeText(full).then(() => {
    ElMessage({ type: 'success', message: '已复制 Prompt，可粘贴到 ChatGPT / Claude 等在线 LLM，将返回的 JSON 粘贴回下方的评分标准编辑器' })
  }).catch(() => {
    ElMessage({ type: 'error', message: '复制失败，请检查浏览器权限' })
  })
}

const handleGenerateRubric = async (job: JobItem) => {
  ensureResumeLlmConfig(job)
  const sourceJd = job.filter.resumeLlmConfig?.sourceJd?.trim() || ''
  if (!sourceJd) {
    ElMessage({ type: 'warning', message: '请先输入岗位描述' })
    return
  }
  job._generatingRubric = true
  try {
    const modelId = job.filter.resumeLlmConfig?.rubricGenerationModelId ?? null
    const { rubric } = await ipcRenderer.invoke('generate-llm-rubric', { sourceJd, modelId })
    if (rubric) {
      job.filter.resumeLlmConfig!.rubric = {
        knockouts: rubric.knockouts ?? [],
        dimensions: (rubric.dimensions ?? []).map((d: any) => ({
          name: d.name ?? '',
          weight: d.weight ?? 33,
          criteria: {
            '1': d.criteria?.['1'] ?? d.criteria?.[1] ?? '',
            '3': d.criteria?.['3'] ?? d.criteria?.[3] ?? '',
            '5': d.criteria?.['5'] ?? d.criteria?.[5] ?? ''
          }
        }))
      }
      ElMessage({ type: 'success', message: '评分标准已生成，可微调后保存' })
    } else {
      ElMessage({ type: 'error', message: '生成失败，请检查 LLM 配置' })
    }
  } catch (err: any) {
    ElMessage({ type: 'error', message: err?.message ?? '生成失败' })
    console.error(err)
  } finally {
    job._generatingRubric = false
  }
}

function addKnockout(job: JobItem) {
  ensureResumeLlmConfig(job)
  job.filter.resumeLlmConfig!.rubric.knockouts.push('新否决项')
}

function removeDimension(job: JobItem, idx: number) {
  job.filter.resumeLlmConfig?.rubric?.dimensions?.splice(idx, 1)
}

function handleImportRubricJson(job: JobItem) {
  ensureResumeLlmConfig(job)
  const raw = (job._rubricJsonImport ?? '').trim()
  if (!raw) return
  try {
    const jsonStr = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')
    const parsed = JSON.parse(jsonStr)
    const knockouts = Array.isArray(parsed.knockouts)
      ? parsed.knockouts.filter((k: any) => typeof k === 'string')
      : []
    const dimensions = (Array.isArray(parsed.dimensions) ? parsed.dimensions : [])
      .filter((d: any) => d && typeof d.name === 'string')
      .map((d: any) => ({
        name: String(d.name),
        weight: typeof d.weight === 'number' ? d.weight : 33,
        criteria: {
          '1': String(d.criteria?.['1'] ?? d.criteria?.[1] ?? ''),
          '3': String(d.criteria?.['3'] ?? d.criteria?.[3] ?? ''),
          '5': String(d.criteria?.['5'] ?? d.criteria?.[5] ?? '')
        }
      }))
    if (dimensions.length === 0) {
      ElMessage({ type: 'warning', message: 'JSON 中未找到有效的 dimensions，请检查格式' })
      return
    }
    job.filter.resumeLlmConfig!.rubric = { knockouts, dimensions }
    job._rubricJsonImport = ''
    ElMessage({ type: 'success', message: `已导入 ${dimensions.length} 个维度，${knockouts.length} 个否决项` })
  } catch {
    ElMessage({ type: 'error', message: 'JSON 解析失败，请检查格式' })
  }
}

function addDimension(job: JobItem) {
  ensureResumeLlmConfig(job)
  job.filter.resumeLlmConfig!.rubric.dimensions.push({
    name: '新维度',
    weight: 33,
    criteria: { '1': '', '3': '', '5': '' }
  })
}
</script>

<style lang="scss" scoped>
.boss-job-config__wrap {
  width: 100%;
  height: 100%;
  overflow: auto;
  position: relative;

  .main__wrap {
    padding: 24px;
    max-width: 860px;
    margin: 0 auto;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
  }

  .job-collapse {
    :deep(.el-collapse-item__header) {
      font-size: 14px;
      font-weight: 500;
      gap: 8px;
    }

    .collapse-title {
      flex: 1;
    }

    .copy-btn {
      margin-right: 8px;
      font-size: 12px;
    }
  }

  .job-form {
    padding: 8px 4px 0;

    .section-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: #606266;
      margin: 16px 0 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #ebeef5;

      &:first-child {
        margin-top: 0;
      }
    }

    .filter-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;

      > .el-checkbox {
        margin-top: 32px;
        flex-shrink: 0;
      }

      > .flex-1 {
        flex: 1;
        min-width: 0;
      }
    }

    .resume-module-row {
      > .el-checkbox {
        margin-top: 0;
      }
    }

    .resume-module-content {
      margin-left: 24px;
    }

    .form-tip {
      font-size: 12px;
      color: #909399;
      margin-top: 4px;
      line-height: 1.4;
    }

    .resume-filter-tip {
      margin-bottom: 8px;
    }

    .quick-fill-bar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 2px;
      margin-top: 4px;

      .quick-fill-label {
        font-size: 12px;
        color: #909399;
      }
    }

    .job-action-bar {
      display: flex;
      justify-content: flex-end;
      padding: 16px 0 8px;
      border-top: 1px solid #ebeef5;
      margin-top: 8px;
    }
  }

  .copy-source-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
  }

  .llm-rubric-panel {
    margin-left: 24px;
    margin-top: 8px;
  }

  .rubric-step {
    margin-bottom: 16px;

    .rubric-step-label {
      font-size: 13px;
      font-weight: 500;
      color: #606266;
      margin-bottom: 8px;
      display: block;

      .rubric-step-sublabel {
        font-size: 12px;
        font-weight: 400;
        color: #909399;
        margin-left: 4px;
      }
    }

    .generate-bar {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
  }

  .rubric-import-step {
    background: #f8fdfb;
    border: 1px dashed #b3c8c3;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 16px;
  }

  .rubric-editor {
    .rubric-block {
      margin-bottom: 16px;

      .rubric-block-title {
        font-size: 12px;
        color: #909399;
        display: block;
        margin-bottom: 6px;
      }
    }

    .knockout-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    .dimensions-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .dimension-card {
      padding: 12px;
      border: 1px solid #ebeef5;

      .dimension-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;

        .dimension-name {
          width: 120px;
        }

        .dimension-weight {
          flex: 1;
          max-width: 200px;
        }

        .weight-label {
          font-size: 12px;
          color: #909399;
          min-width: 60px;
        }
      }

      .dimension-criteria {
        .criteria-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;

          .criteria-score {
            font-size: 12px;
            color: #909399;
            min-width: 32px;
          }

          .el-input {
            flex: 1;
          }
        }
      }
    }

    .pass-threshold {
      .threshold-value {
        font-size: 12px;
        color: #909399;
        margin-left: 8px;
      }
    }
  }

  .fallback-rule {
    margin-top: 12px;
  }
}
</style>
