<template>
  <div class="debug-tool__wrap">
    <div class="main__wrap">
      <!-- 顶部控制栏 -->
      <el-card class="section">
        <div class="section-title">招聘端调试工具</div>
        <div class="section-desc">
          启动浏览器并打开沟通页，在右侧手动选中一条会话，再用下方按钮测试各项功能。<br />
          <strong>Tab A</strong> 需要浏览器已就绪；<strong>Tab B「LLM 筛选」</strong>的「运行评估」和「生成 Rubric」不需要浏览器。
        </div>
        <div class="action-bar">
          <el-button
            type="primary"
            :loading="isLaunching"
            :disabled="isReady"
            @click="handleLaunch"
          >
            {{ isReady ? '浏览器已启动' : '启动浏览器' }}
          </el-button>
          <el-button :disabled="!isReady" @click="handleClose">关闭浏览器</el-button>
          <el-tag v-if="isReady" type="success">已就绪</el-tag>
          <el-tag v-else-if="isLaunching" type="warning">启动中...</el-tag>
          <el-tag v-else type="info">未启动</el-tag>
        </div>
      </el-card>

      <!-- Tab 切换 -->
      <el-tabs v-model="activeTab" class="debug-tabs">
        <!-- ── Tab A: 简历操作 ── -->
        <el-tab-pane label="简历操作" name="resume">
          <el-card class="section" :class="{ disabled: !isReady }">
            <div class="section-title">当前会话操作</div>
            <div class="cmd-grid">
              <div v-for="cmd in commands" :key="cmd.type" class="cmd-item">
                <el-button
                  :loading="runningCmd === cmd.type"
                  :disabled="!isReady || (runningCmd !== null && runningCmd !== cmd.type)"
                  @click="handleCmd(cmd.type)"
                >
                  {{ cmd.label }}
                </el-button>
                <span v-if="results[cmd.type]" class="cmd-result" :class="results[cmd.type].ok ? 'ok' : 'err'">
                  {{ results[cmd.type].text }}
                </span>
              </div>
            </div>
          </el-card>
        </el-tab-pane>

        <!-- ── Tab B: LLM 筛选 ── -->
        <el-tab-pane label="LLM 筛选" name="llm">

          <!-- 区域 1：生成 Rubric（工作流起点） -->
          <el-card class="section">
            <div class="section-title">区域 1：生成 Rubric</div>
            <div class="section-desc">
              输入 JD → 自动生成评分标准。生成后可直接编辑 JSON，再点「用于评估」传到区域 2。
            </div>

            <div class="llm-label">岗位描述（JD）</div>
            <el-input
              v-model="generateJd"
              type="textarea"
              :rows="5"
              placeholder="粘贴岗位描述、招聘要求或标杆简历片段..."
            />
            <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
              <el-button :loading="isGenerating" type="primary" plain @click="handleGenerateRubric">
                ✨ 生成 Rubric
              </el-button>
              <template v-if="generatedRubricJson">
                <el-button @click="copyGeneratedRubric">📋 复制 JSON</el-button>
                <el-button type="success" plain @click="useGeneratedRubricForEval">
                  ➡ 用于评估
                </el-button>
                <el-divider direction="vertical" />
                <el-select
                  v-model="applyTargetJobId"
                  placeholder="选择目标职位..."
                  clearable
                  style="width: 200px"
                  size="small"
                >
                  <el-option
                    v-for="j in allJobs"
                    :key="j.jobId"
                    :label="j.jobName"
                    :value="j.jobId"
                  />
                </el-select>
                <el-button
                  :disabled="!applyTargetJobId"
                  :loading="isApplying"
                  type="primary"
                  size="small"
                  @click="handleApplyRubricToJob"
                >
                  应用到职位配置
                </el-button>
              </template>
            </div>

            <template v-if="generatedRubricJson !== null">
              <div class="llm-label" style="margin-top: 10px;">
                生成结果（可编辑）
                <el-text size="small" type="info" style="margin-left: 6px;">修改后点「用于评估」即时生效</el-text>
              </div>
              <el-input
                v-model="generatedRubricJson"
                type="textarea"
                :rows="12"
              />
            </template>
          </el-card>

          <!-- 区域 2：提取简历文本 -->
          <el-card class="section">
            <div class="section-title">区域 2：提取简历文本</div>
            <div class="section-desc">需浏览器已就绪且已在沟通页选中一条会话。</div>
            <el-button
              :loading="isExtractingText"
              :disabled="!isReady || isExtractingText"
              type="primary"
              plain
              @click="handleExtractResumeText"
            >
              📄 提取当前简历文本
            </el-button>
            <template v-if="extractedResumeText">
              <div class="llm-label" style="margin-top: 10px;">
                提取结果（{{ extractedResumeText.length }} 字）
              </div>
              <el-input
                :model-value="extractedResumeText"
                type="textarea"
                :rows="6"
                readonly
                class="extracted-text"
              />
            </template>
          </el-card>

          <!-- 区域 3：运行 Rubric 评估 -->
          <el-card class="section">
            <div class="section-title">区域 3：运行 Rubric 评估</div>
            <div class="section-desc">不需要浏览器，直接调用 LLM API。需已配置 <code>boss-llm.json</code>。</div>

            <!-- Rubric 来源选择 -->
            <div class="llm-label">Rubric 来源</div>
            <el-radio-group v-model="screenRubricSource" class="rubric-source-group">
              <el-radio value="job">从职位配置读取</el-radio>
              <el-radio value="manual">手动填写 JSON</el-radio>
            </el-radio-group>

            <!-- 职位选择 -->
            <template v-if="screenRubricSource === 'job'">
              <div class="llm-label" style="margin-top: 10px;">选择职位</div>
              <el-select
                v-model="screenJobId"
                placeholder="选择已配置 resumeLlmEnabled 的职位"
                style="width: 100%"
                @change="loadJobRubricPreview"
              >
                <el-option
                  v-for="j in llmEnabledJobs"
                  :key="j.jobId"
                  :label="j.jobName"
                  :value="j.jobId"
                />
              </el-select>
              <div v-if="jobRubricPreview" class="rubric-preview">
                <div class="rubric-preview-title">Rubric 预览</div>
                <pre class="rubric-pre">{{ jobRubricPreview }}</pre>
              </div>
              <el-alert v-else-if="screenJobId" type="warning" show-icon :closable="false" style="margin-top: 8px">
                该职位未配置 resumeLlmConfig.rubric，请先在「职位配置」页面生成。
              </el-alert>
            </template>

            <!-- 手动填写 -->
            <template v-else>
              <div class="llm-label" style="margin-top: 10px;">
                Rubric JSON
                <el-text size="small" type="info">
                  格式: {"knockouts":[],"dimensions":[],"passThreshold":75}
                </el-text>
                <el-button
                  v-if="generatedRubricJson"
                  size="small"
                  text
                  style="margin-left: 8px"
                  @click="manualRubricJson = generatedRubricJson"
                >
                  从区域 1 填入
                </el-button>
              </div>
              <el-input
                v-model="manualRubricJson"
                type="textarea"
                :rows="5"
                placeholder='{"knockouts":["必须拥有X经验"],"dimensions":[{"name":"技术能力","weight":100,"criteria":{"1":"无","3":"有","5":"精通"}}],"passThreshold":75}'
              />
            </template>

            <!-- 简历文本 -->
            <div class="llm-label" style="margin-top: 12px;">简历文本（来自区域 2 或手动粘贴）</div>
            <el-input
              v-model="screenResumeText"
              type="textarea"
              :rows="5"
              placeholder="简历全文..."
            />
            <div v-if="extractedResumeText && !screenResumeText" class="form-tip">
              ← 点击「使用区域 2 文本」快速填入
              <el-button size="small" text @click="screenResumeText = extractedResumeText">使用区域 2 文本</el-button>
            </div>

            <el-button
              :loading="isScreening"
              type="primary"
              style="margin-top: 10px"
              @click="handleLlmScreen"
            >
              🤖 运行 LLM 评估
            </el-button>

            <!-- 评估结果 -->
            <template v-if="screenResult">
              <div class="screen-result" :class="screenResult.isPassed ? 'passed' : 'failed'">
                <div class="screen-result-status">
                  {{ screenResult.isPassed ? '✅ 通过' : '❌ 未通过' }}
                  <span class="screen-score">{{ screenResult.totalScore }} / 100 分</span>
                </div>

                <!-- 分维度得分 -->
                <div v-if="screenResult.dimensionResults?.length" class="dimension-scores">
                  <div
                    v-for="d in screenResult.dimensionResults"
                    :key="d.name"
                    class="dim-row"
                  >
                    <span class="dim-name">{{ d.name }}</span>
                    <el-progress
                      :percentage="Math.round((d.score / 5) * 100)"
                      :color="dimColor(d.score)"
                      :stroke-width="8"
                      style="flex: 1; min-width: 80px;"
                    />
                    <span class="dim-score">{{ d.score }}/5</span>
                  </div>
                </div>

                <div class="screen-reason">{{ screenResult.reason }}</div>
              </div>
            </template>
          </el-card>
        </el-tab-pane>
      </el-tabs>

      <!-- 统一操作日志 -->
      <el-card class="section log-section">
        <div class="section-title">
          操作日志
          <el-button size="small" text @click="logs = []">清空</el-button>
        </div>
        <div ref="logContainerRef" class="log-content">
          <div v-for="(line, i) in logs" :key="i" class="log-line" :class="line.type">
            <span class="log-time">{{ line.time }}</span>
            <span class="log-msg">{{ line.msg }}</span>
          </div>
          <div v-if="logs.length === 0" class="log-empty">暂无日志</div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage } from 'element-plus'

const { ipcRenderer } = electron

// ── 浏览器状态 ──────────────────────────────────────────────────────────────
const isLaunching = ref(false)
const isReady = ref(false)
const runningCmd = ref<string | null>(null)
const activeTab = ref<'resume' | 'llm'>('resume')

// ── 日志 ────────────────────────────────────────────────────────────────────
type LogLine = { time: string; msg: string; type: 'info' | 'ok' | 'err' }
const logs = ref<LogLine[]>([])
const logContainerRef = ref<HTMLElement | null>(null)

type CmdResult = { ok: boolean; text: string }
const results = ref<Record<string, CmdResult>>({})

// ── Tab A 命令列表 ──────────────────────────────────────────────────────────
const commands = [
  { type: 'get-panel-name', label: '获取当前面板姓名' },
  { type: 'dismiss-intent-dialog', label: '关闭「意向沟通」弹窗' },
  { type: 'close-online-resume', label: '关闭在线简历弹窗' },
  { type: 'open-online-resume', label: '打开在线简历' },
  { type: 'check-attach-resume', label: '检查附件简历（是否有「点击预览」）' },
  { type: 'accept-incoming-attach-resume', label: '同意对方发来的附件请求（仅当出现「是否同意」时）' },
  { type: 'request-attach-resume', label: '请求附件简历' },
  { type: 'download-attach-resume', label: '预览并下载附件简历' },
  { type: 'ping', label: 'Ping（探活）' },
]

// ── Tab B 状态 ──────────────────────────────────────────────────────────────

// 区域 1：生成 Rubric
const generateJd = ref('')
const isGenerating = ref(false)
const generatedRubricJson = ref<string | null>(null)
const applyTargetJobId = ref('')
const isApplying = ref(false)
const allJobs = ref<{ jobId: string; jobName: string }[]>([])

// 区域 2：提取简历文本
const isExtractingText = ref(false)
const extractedResumeText = ref('')

// 区域 3：运行评估
const screenRubricSource = ref<'job' | 'manual'>('manual')
const screenJobId = ref('')
const screenResumeText = ref('')
const manualRubricJson = ref('')
const isScreening = ref(false)
type DimResult = { name: string; score: number; weight: number }
const screenResult = ref<{
  isPassed: boolean
  totalScore: number
  reason: string
  dimensionResults?: DimResult[]
} | null>(null)
const jobRubricPreview = ref('')
const llmEnabledJobs = computed(() => allJobs.value.filter((j: any) => (j as any).filter?.resumeLlmEnabled))

// ── 通用 ─────────────────────────────────────────────────────────────────────
function addLog(msg: string, type: LogLine['type'] = 'info') {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  logs.value.push({ time, msg, type })
  nextTick(() => {
    if (logContainerRef.value) logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight
  })
}

function dimColor(score: number) {
  if (score >= 4) return '#67c23a'
  if (score >= 3) return '#e6a23c'
  return '#f56c6c'
}

// ── 生命周期 / IPC 监听 ───────────────────────────────────────────────────────
ipcRenderer.on('boss-chat-debug-exited', () => {
  isReady.value = false
  addLog('浏览器已关闭', 'err')
})

onMounted(async () => {
  try {
    const result = await ipcRenderer.invoke('fetch-boss-jobs-config')
    allJobs.value = (result?.jobs ?? []).map((j: any) => ({
      jobId: j.jobId ?? j.id,
      jobName: j.jobName ?? j.name ?? j.jobId ?? j.id,
      filter: j.filter
    }))
  } catch {
    // 忽略
  }
})

onUnmounted(() => {
  ipcRenderer.removeAllListeners('boss-chat-debug-exited')
})

// ── 浏览器控制 ────────────────────────────────────────────────────────────────
const handleLaunch = async () => {
  isLaunching.value = true
  addLog('正在启动浏览器...')
  try {
    const res = await ipcRenderer.invoke('open-boss-chat-debug')
    if (res?.ok) {
      isReady.value = true
      addLog(res.alreadyRunning ? '浏览器已在运行' : '浏览器启动成功，已打开沟通页', 'ok')
    } else {
      addLog(`启动失败: ${res?.error ?? '未知错误'}`, 'err')
      ElMessage({ type: 'error', message: `启动失败: ${res?.error}` })
    }
  } catch (err: any) {
    addLog(`启动异常: ${err?.message}`, 'err')
    ElMessage({ type: 'error', message: err?.message })
  } finally {
    isLaunching.value = false
  }
}

const handleClose = async () => {
  await ipcRenderer.invoke('close-boss-chat-debug')
  isReady.value = false
  addLog('已关闭浏览器')
}

// ── Tab A：命令执行 ───────────────────────────────────────────────────────────
const handleCmd = async (type: string) => {
  runningCmd.value = type
  results.value[type] = { ok: true, text: '执行中...' }
  addLog(`→ ${type}`)
  try {
    const res = await ipcRenderer.invoke('boss-debug-command', { type })
    const ok = res?.ok === true
    const detail = JSON.stringify(res?.result ?? res?.error ?? '')
    results.value[type] = { ok, text: ok ? `✓ ${detail}` : `✗ ${res?.error ?? detail}` }
    addLog(`← ${type}: ${ok ? '成功' : '失败'} ${detail}`, ok ? 'ok' : 'err')
  } catch (err: any) {
    results.value[type] = { ok: false, text: `✗ ${err?.message}` }
    addLog(`← ${type}: 异常 ${err?.message}`, 'err')
  } finally {
    runningCmd.value = null
  }
}

// ── Tab B：区域 2 — 提取简历文本 ──────────────────────────────────────────────
const handleExtractResumeText = async () => {
  isExtractingText.value = true
  addLog('→ extract-resume-text（通过浏览器提取简历）')
  try {
    const res = await ipcRenderer.invoke('boss-debug-command', { type: 'extract-resume-text' })
    if (res?.ok) {
      extractedResumeText.value = res.result?.resumeText ?? ''
      screenResumeText.value = extractedResumeText.value
      addLog(`← 提取成功，共 ${res.result?.charCount ?? 0} 字`, 'ok')
    } else {
      addLog(`← 提取失败: ${res?.error}`, 'err')
      ElMessage({ type: 'error', message: `提取失败: ${res?.error}` })
    }
  } catch (err: any) {
    addLog(`← 提取异常: ${err?.message}`, 'err')
    ElMessage({ type: 'error', message: err?.message })
  } finally {
    isExtractingText.value = false
  }
}

// ── Tab B：区域 3 — Rubric 来源 ───────────────────────────────────────────────
function loadJobRubricPreview(jobId: string) {
  jobRubricPreview.value = ''
  const job = allJobs.value.find((j: any) => j.jobId === jobId)
  const rubric = (job as any)?.filter?.resumeLlmConfig?.rubric
  if (rubric) {
    jobRubricPreview.value = JSON.stringify(
      {
        knockouts: rubric.knockouts,
        dimensions: rubric.dimensions,
        passThreshold: (job as any)?.filter?.resumeLlmConfig?.passThreshold ?? 75
      },
      null,
      2
    )
  }
}

// ── Tab B：区域 3 — 运行 LLM 评估 ─────────────────────────────────────────────
const handleLlmScreen = async () => {
  if (!screenResumeText.value.trim()) {
    ElMessage({ type: 'warning', message: '请先填入简历文本' })
    return
  }
  isScreening.value = true
  screenResult.value = null
  addLog('→ llm-screen-resume')

  let payload: Record<string, any> = { resumeText: screenResumeText.value }
  if (screenRubricSource.value === 'job') {
    if (!screenJobId.value) {
      ElMessage({ type: 'warning', message: '请选择职位' })
      isScreening.value = false
      return
    }
    payload.jobId = screenJobId.value
  } else {
    try {
      payload.rubric = JSON.parse(manualRubricJson.value)
    } catch {
      ElMessage({ type: 'error', message: 'Rubric JSON 格式错误，请检查' })
      isScreening.value = false
      return
    }
  }

  try {
    const res = await ipcRenderer.invoke('llm-screen-resume', payload)
    if (res?.ok === false) {
      addLog(`← LLM 评估失败: ${res.error}`, 'err')
      ElMessage({ type: 'error', message: res.error })
    } else {
      screenResult.value = {
        isPassed: res.isPassed,
        totalScore: res.totalScore,
        reason: res.reason,
        dimensionResults: res.dimensionResults
      }
      addLog(
        `← LLM 评估完成：${res.isPassed ? '通过' : '未通过'} ${res.totalScore}分 ${res.reason}`,
        res.isPassed ? 'ok' : 'err'
      )
    }
  } catch (err: any) {
    addLog(`← LLM 评估异常: ${err?.message}`, 'err')
    ElMessage({ type: 'error', message: err?.message })
  } finally {
    isScreening.value = false
  }
}

// ── Tab B：区域 1 — 生成 Rubric ────────────────────────────────────────────────
const handleGenerateRubric = async () => {
  if (!generateJd.value.trim()) {
    ElMessage({ type: 'warning', message: '请先输入岗位描述' })
    return
  }
  isGenerating.value = true
  generatedRubricJson.value = null
  addLog('→ generate-llm-rubric')
  try {
    const res = await ipcRenderer.invoke('generate-llm-rubric', { sourceJd: generateJd.value })
    if (res?.rubric) {
      generatedRubricJson.value = JSON.stringify(
        { ...res.rubric, passThreshold: 75 },
        null,
        2
      )
      addLog(`← 生成成功：${res.rubric.knockouts?.length ?? 0} 个否决项，${res.rubric.dimensions?.length ?? 0} 个维度`, 'ok')
    } else {
      addLog('← 生成失败，请检查 LLM 配置', 'err')
      ElMessage({ type: 'error', message: '生成失败，请检查 boss-llm.json 配置' })
    }
  } catch (err: any) {
    addLog(`← 生成异常: ${err?.message}`, 'err')
    ElMessage({ type: 'error', message: err?.message })
  } finally {
    isGenerating.value = false
  }
}

async function copyGeneratedRubric() {
  try {
    await navigator.clipboard.writeText(generatedRubricJson.value ?? '')
    ElMessage({ type: 'success', message: '已复制到剪贴板' })
  } catch {
    ElMessage({ type: 'error', message: '复制失败，请手动选中文本复制' })
  }
}

function useGeneratedRubricForEval() {
  if (!generatedRubricJson.value) return
  manualRubricJson.value = generatedRubricJson.value
  screenRubricSource.value = 'manual'
  ElMessage({ type: 'success', message: '已填入区域 3，切换为手动模式' })
}

async function handleApplyRubricToJob() {
  if (!applyTargetJobId.value || !generatedRubricJson.value) return
  let rubric: any
  try {
    rubric = JSON.parse(generatedRubricJson.value)
  } catch {
    ElMessage({ type: 'error', message: 'Rubric JSON 格式错误' })
    return
  }
  isApplying.value = true
  addLog(`→ 应用 Rubric 到职位 ${applyTargetJobId.value}`)
  try {
    const res = await ipcRenderer.invoke('apply-rubric-to-job', {
      jobId: applyTargetJobId.value,
      rubric: { knockouts: rubric.knockouts, dimensions: rubric.dimensions },
      passThreshold: rubric.passThreshold ?? 75
    })
    if (res?.ok) {
      addLog(`← 应用成功`, 'ok')
      ElMessage({ type: 'success', message: '已成功应用到职位配置' })
      // refresh jobs list
      const result = await ipcRenderer.invoke('fetch-boss-jobs-config')
      allJobs.value = (result?.jobs ?? []).map((j: any) => ({
        jobId: j.jobId ?? j.id,
        jobName: j.jobName ?? j.name ?? j.jobId ?? j.id,
        filter: j.filter
      }))
    } else {
      addLog(`← 应用失败: ${res?.error}`, 'err')
      ElMessage({ type: 'error', message: res?.error ?? '应用失败' })
    }
  } catch (err: any) {
    addLog(`← 应用异常: ${err?.message}`, 'err')
    ElMessage({ type: 'error', message: err?.message })
  } finally {
    isApplying.value = false
  }
}
</script>

<style lang="scss" scoped>
.debug-tool__wrap {
  width: 100%;
  height: 100%;
  overflow: auto;

  .main__wrap {
    padding: 24px;
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section {
    &.disabled {
      opacity: 0.6;
      pointer-events: none;
    }

    .section-title {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-desc {
      font-size: 13px;
      color: #909399;
      margin-bottom: 16px;
      line-height: 1.7;
    }
  }

  .action-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .debug-tabs {
    :deep(.el-tabs__content) {
      padding: 0;
    }

    :deep(.el-tab-pane) {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
  }

  .cmd-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;

    .cmd-item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;

      .el-button {
        flex-shrink: 0;
      }

      .cmd-result {
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;

        &.ok { color: #67c23a; }
        &.err { color: #f56c6c; }
      }
    }
  }

  // Tab B styles
  .llm-label {
    font-size: 13px;
    font-weight: 500;
    color: #606266;
    margin-bottom: 6px;
  }

  .rubric-source-group {
    margin-bottom: 4px;
  }

  .rubric-preview {
    margin-top: 8px;
    background: #f5f7fa;
    border-radius: 4px;
    padding: 10px;

    .rubric-preview-title {
      font-size: 12px;
      color: #909399;
      margin-bottom: 6px;
    }

    .rubric-pre {
      font-size: 12px;
      font-family: monospace;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 160px;
      overflow: auto;
    }
  }

  .form-tip {
    font-size: 12px;
    color: #909399;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .screen-result {
    margin-top: 12px;
    padding: 12px 16px;
    border-radius: 6px;
    border-left: 4px solid;

    &.passed {
      background: #f0f9eb;
      border-color: #67c23a;

      .screen-result-status { color: #67c23a; }
    }

    &.failed {
      background: #fef0f0;
      border-color: #f56c6c;

      .screen-result-status { color: #f56c6c; }
    }

    .screen-result-status {
      font-weight: 600;
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 12px;

      .screen-score {
        font-size: 14px;
        font-weight: 400;
      }
    }

    .dimension-scores {
      margin: 10px 0 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;

      .dim-row {
        display: flex;
        align-items: center;
        gap: 8px;

        .dim-name {
          font-size: 12px;
          color: #606266;
          width: 130px;
          flex-shrink: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dim-score {
          font-size: 12px;
          color: #606266;
          width: 32px;
          flex-shrink: 0;
          text-align: right;
        }
      }
    }

    .screen-reason {
      font-size: 13px;
      color: #606266;
      margin-top: 6px;
      line-height: 1.6;
    }
  }

  .extracted-text {
    margin-top: 6px;

    :deep(textarea) {
      font-family: monospace;
      font-size: 12px;
    }
  }

  .log-section {
    .log-content {
      height: 260px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 12px;
      background: #f5f7fa;
      border-radius: 4px;
      padding: 8px;

      .log-line {
        display: flex;
        gap: 8px;
        margin-bottom: 2px;
        line-height: 1.5;

        .log-time { color: #909399; flex-shrink: 0; }
        .log-msg { word-break: break-all; }

        &.ok .log-msg { color: #67c23a; }
        &.err .log-msg { color: #f56c6c; }
      }

      .log-empty {
        color: #c0c4cc;
        text-align: center;
        margin-top: 40px;
      }
    }
  }
}
</style>
