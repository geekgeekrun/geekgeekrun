<template>
  <div class="boss-auto-sequence__wrap">
    <div class="main__wrap">
      <el-card class="config-section">
        <template #header>
          <span>职位执行队列</span>
        </template>
        <template v-if="jobsList.length === 0">
          <el-alert
            title="请先在「职位配置」页面同步职位列表"
            type="info"
            :closable="false"
            show-icon
          />
        </template>
        <template v-else>
          <el-table :data="jobsList" style="width: 100%">
            <el-table-column prop="jobName" label="职位名称" />
            <el-table-column label="纳入执行" width="100" align="center">
              <template #default="{ row }">
                <el-checkbox v-model="row.sequence.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="执行推荐牛人" width="120" align="center">
              <template #default="{ row }">
                <el-checkbox v-model="row.sequence.runRecommend" :disabled="!row.sequence.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="执行沟通页" width="110" align="center">
              <template #default="{ row }">
                <el-checkbox v-model="row.sequence.runChat" :disabled="!row.sequence.enabled" />
              </template>
            </el-table-column>
          </el-table>
          <div class="queue-save-bar">
            <el-button :loading="isSavingQueue" @click="handleSaveQueue">保存队列配置</el-button>
          </div>
        </template>
      </el-card>

      <el-card class="config-section">
        <template #header>
          <span>自动顺序执行</span>
        </template>
        <p class="desc">
          依次执行「推荐牛人 - 自动开聊」和「沟通页」两个任务，配置分别在对应页面中设置。
        </p>
        <div class="action-bar">
          <el-button type="primary" :loading="isSaving" @click="handleSubmit">
            开始自动顺序执行！
          </el-button>
        </div>
      </el-card>
    </div>

    <div
      class="running-overlay__wrap"
      :style="{
        pointerEvents: 'none'
      }"
    >
      <RunningOverlay
        ref="runningOverlayRef"
        worker-id="bossAutoBrowseAndChatMain"
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
import { ref, onMounted, onActivated } from 'vue'
import { ElMessage } from 'element-plus'
import RunningOverlay from '@renderer/features/RunningOverlay/index.vue'
import { RUNNING_STATUS_ENUM } from '../../../../../common/enums/auto-start-chat'
import { getBossAutoBrowseSteps } from '../../../../../common/prerequisite-step-by-step-check'

const { ipcRenderer } = electron

const isSaving = ref(false)
const runRecordId = ref<number | null>(null)
const runningOverlayRef = ref<InstanceType<typeof RunningOverlay> | null>(null)
const isStopButtonLoading = ref(false)

// ---- 职位执行队列 ----

interface JobSequenceItem {
  jobId: string
  jobName: string
  sequence: { enabled: boolean; runRecommend: boolean; runChat: boolean }
  [key: string]: unknown
}

const jobsList = ref<JobSequenceItem[]>([])
const isSavingQueue = ref(false)

const loadJobsList = async () => {
  try {
    const result = await ipcRenderer.invoke('fetch-boss-jobs-config')
    jobsList.value = result?.jobs ?? []
  } catch (err) {
    console.error(err)
  }
}

onMounted(loadJobsList)
onActivated(loadJobsList)

const handleSaveQueue = async () => {
  isSavingQueue.value = true
  try {
    await ipcRenderer.invoke('save-boss-jobs-config', JSON.stringify({ jobs: jobsList.value }))
    ElMessage({ type: 'success', message: '队列配置已保存' })
  } catch (err) {
    ElMessage({ type: 'error', message: '保存失败' })
    console.error(err)
  } finally {
    isSavingQueue.value = false
  }
}

const handleSubmit = async () => {
  isSaving.value = true
  try {
    runningOverlayRef.value?.show()
    const { runRecordId: rrId } = await ipcRenderer.invoke('run-boss-auto-browse-and-chat')
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
    await ipcRenderer.invoke('stop-boss-auto-browse-and-chat')
    runningOverlayRef.value?.hide()
  } finally {
    isStopButtonLoading.value = false
  }
}
</script>

<style lang="scss" scoped>
.boss-auto-sequence__wrap {
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
  }

  .desc {
    margin: 0 0 1em;
    font-size: 14px;
    color: #606266;
    line-height: 1.6;
  }

  .queue-save-bar {
    display: flex;
    align-items: center;
    padding: 12px 0 0;
  }

  .action-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0 0;
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
