<template>
  <div class="boss-auto-browse-and-chat__wrap">
    <div class="main__wrap">
      <el-form ref="formRef" :model="formContent" label-position="top">
        <el-card class="config-section">
          <el-form-item label="招呼语（全局默认）" prop="autoChat.greetingMessage">
            <el-input
              v-model="formContent.autoChat.greetingMessage"
              type="textarea"
              :autosize="{ minRows: 1 }"
              placeholder="向候选人发送的第一条消息（各职位可在「职位配置」页覆盖）"
            />
          </el-form-item>
          <el-form-item label="每次最多开聊人数（全局默认）" prop="autoChat.maxChatPerRun">
            <el-input-number
              v-model="formContent.autoChat.maxChatPerRun"
              :min="1"
              :max="200"
              controls-position="right"
            />
            <div class="form-tip">单轮运行中最多向多少人发送招呼；各职位可在「职位配置」页覆盖</div>
          </el-form-item>
          <el-form-item label="两次开聊间隔（毫秒）">
            <div class="range-input-wrap">
              <el-input-number
                v-model="formContent.autoChat.delayBetweenChats[0]"
                :min="0"
                controls-position="right"
                placeholder="最小值"
              />
              <span class="range-sep">~</span>
              <el-input-number
                v-model="formContent.autoChat.delayBetweenChats[1]"
                :min="0"
                controls-position="right"
                placeholder="最大值"
              />
            </div>
          </el-form-item>
        </el-card>

        <el-card class="config-section">
          <el-form-item mb0>
            <div class="section-title">推荐页运行策略</div>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="formContent.recommendRunOnceAfterComplete">
              单轮运行完成后停止（不再自动重启）
            </el-checkbox>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="formContent.recommendClickNotInterestedForFiltered">
              对未通过筛选的候选人自动点击"不感兴趣"
            </el-checkbox>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="formContent.recommendSkipViewedCandidates">
              跳过已读候选人卡片（带 has-viewed）
            </el-checkbox>
          </el-form-item>
          <el-form-item label="两轮之间的等待间隔（毫秒，反检测）">
            <el-input-number
              v-model="formContent.recommendRerunIntervalMs"
              :min="1000"
              controls-position="right"
              placeholder="默认 3000"
            />
          </el-form-item>
          <el-form-item label='每次点击"不感兴趣"之间的间隔（毫秒，随机[min,max]，反检测）'>
            <div class="range-input-wrap">
              <el-input-number
                v-model="formContent.recommendDelayBetweenNotInterestedMs[0]"
                :min="300"
                controls-position="right"
                placeholder="最小"
              />
              <span class="range-sep">~</span>
              <el-input-number
                v-model="formContent.recommendDelayBetweenNotInterestedMs[1]"
                :min="300"
                controls-position="right"
                placeholder="最大"
              />
            </div>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="formContent.recommendKeepBrowserOpenAfterRun">
              单轮结束后保持浏览器打开（仅招聘端推荐页；需同时勾选"单轮运行完成后停止"；关闭浏览器窗口后自动退出）
            </el-checkbox>
          </el-form-item>
        </el-card>

        <div class="action-bar">
          <el-button :loading="isSaving" @click="handleSave">仅保存配置</el-button>
          <el-button type="primary" :loading="isSaving" @click="handleSubmit">
            保存配置，并开始招聘！
          </el-button>
        </div>
      </el-form>
    </div>

    <!-- RunningOverlay -->
    <div
      class="running-overlay__wrap"
      :style="{
        pointerEvents: 'none'
      }"
    >
      <RunningOverlay
        ref="runningOverlayRef"
        worker-id="bossRecommendMain"
        :run-record-id="runRecordId"
        :get-steps="getBossAutoBrowseSteps"
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

<script lang="ts" setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import RunningOverlay from '@renderer/features/RunningOverlay/index.vue'
import { RUNNING_STATUS_ENUM } from '../../../../../common/enums/auto-start-chat'
import { getBossAutoBrowseSteps } from '../../../../../common/prerequisite-step-by-step-check'

const { ipcRenderer } = electron

const formRef = ref()
const isSaving = ref(false)
const runRecordId = ref<number | null>(null)
const runningOverlayRef = ref<InstanceType<typeof RunningOverlay> | null>(null)
const isStopButtonLoading = ref(false)

const formContent = reactive({
  autoChat: {
    greetingMessage: '',
    maxChatPerRun: 50,
    delayBetweenChats: [3000, 8000] as [number, number]
  },
  recommendRunOnceAfterComplete: false,
  recommendClickNotInterestedForFiltered: true,
  recommendSkipViewedCandidates: false,
  recommendRerunIntervalMs: 3000,
  recommendDelayBetweenNotInterestedMs: [800, 2500] as [number, number],
  recommendKeepBrowserOpenAfterRun: false
})

onMounted(async () => {
  try {
    const result = await ipcRenderer.invoke('fetch-boss-recruiter-config-file-content')
    const recruiterConfig = result?.config?.['boss-recruiter.json'] || {}

    formContent.autoChat.greetingMessage = recruiterConfig.autoChat?.greetingMessage ?? ''
    formContent.autoChat.maxChatPerRun = recruiterConfig.autoChat?.maxChatPerRun ?? 50
    formContent.autoChat.delayBetweenChats = recruiterConfig.autoChat?.delayBetweenChats ?? [
      3000, 8000
    ]

    const recommendPage = recruiterConfig.recommendPage ?? {}
    formContent.recommendRunOnceAfterComplete = recommendPage.runOnceAfterComplete ?? false
    formContent.recommendClickNotInterestedForFiltered =
      recommendPage.clickNotInterestedForFiltered ?? true
    formContent.recommendSkipViewedCandidates = recommendPage.skipViewedCandidates ?? false
    formContent.recommendRerunIntervalMs = recommendPage.rerunIntervalMs ?? 3000
    formContent.recommendDelayBetweenNotInterestedMs =
      Array.isArray(recommendPage.delayBetweenNotInterestedMs) &&
      recommendPage.delayBetweenNotInterestedMs.length >= 2
        ? recommendPage.delayBetweenNotInterestedMs
        : [800, 2500]
    formContent.recommendKeepBrowserOpenAfterRun =
      recommendPage.keepBrowserOpenAfterRun ?? false
  } catch (err) {
    console.error(err)
  }
})

const doSave = async () => {
  const payload = {
    autoChat: {
      greetingMessage: formContent.autoChat.greetingMessage,
      maxChatPerRun: formContent.autoChat.maxChatPerRun,
      delayBetweenChats: formContent.autoChat.delayBetweenChats
    },
    recommendPage: {
      runOnceAfterComplete: formContent.recommendRunOnceAfterComplete,
      clickNotInterestedForFiltered: formContent.recommendClickNotInterestedForFiltered,
      skipViewedCandidates: formContent.recommendSkipViewedCandidates,
      rerunIntervalMs: formContent.recommendRerunIntervalMs,
      delayBetweenNotInterestedMs: formContent.recommendDelayBetweenNotInterestedMs,
      keepBrowserOpenAfterRun: formContent.recommendKeepBrowserOpenAfterRun
    }
  }
  await ipcRenderer.invoke('save-boss-recruiter-config', JSON.stringify(payload))
}

const handleSave = async () => {
  isSaving.value = true
  try {
    await doSave()
    ElMessage({ type: 'success', message: '配置已保存' })
  } catch (err) {
    ElMessage({ type: 'error', message: '保存失败' })
    console.error(err)
  } finally {
    isSaving.value = false
  }
}

const handleSubmit = async () => {
  isSaving.value = true
  try {
    await doSave()
    runningOverlayRef.value?.show()
    const { runRecordId: rrId } = await ipcRenderer.invoke('run-boss-recommend')
    runRecordId.value = rrId
  } catch (err) {
    console.error(err)
  } finally {
    isSaving.value = false
  }
}

const handleStopButtonClick = async () => {
  isStopButtonLoading.value = true
  try {
    await ipcRenderer.invoke('stop-boss-recommend')
    runningOverlayRef.value?.hide()
  } finally {
    isStopButtonLoading.value = false
  }
}
</script>

<style lang="scss" scoped>
.boss-auto-browse-and-chat__wrap {
  width: 100%;
  height: 100%;
  overflow: auto;
  position: relative;

  .main__wrap {
    padding: 24px;
    max-width: 800px;
    margin: 0 auto;
  }

  .config-section {
    margin-bottom: 16px;

    .section-title {
      font-size: 14px;
      font-weight: 500;
    }

    .form-tip {
      font-size: 12px;
      color: #909399;
      margin-top: 4px;
      line-height: 1.4;
    }
  }

  .range-input-wrap {
    display: flex;
    align-items: center;
    gap: 8px;

    .range-sep {
      color: #999;
    }
  }

  .action-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 0;
  }
}

.running-overlay__wrap {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
