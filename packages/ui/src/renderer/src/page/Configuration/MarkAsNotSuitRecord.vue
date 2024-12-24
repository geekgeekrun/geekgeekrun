<template>
  <div class="page-wrap flex flex-col of-hidden">
    <div v-loading="isTableLoading" class="flex-1 of-hidden">
      <div ref="tableContainerEl" class="h-100% of-hidden">
        <ElTable
          ref="tableRef"
          :max-height="tableMaxHeight"
          :data="tableData"
          :row-key="getRowKey"
          size="small"
          table-layout="auto"
          highlight-current-row
        >
          <ElTableColumn prop="companyName" label="公司" />
          <ElTableColumn prop="jobName" label="职位名称" />
          <ElTableColumn prop="positionName" label="职位分类" />
          <ElTableColumn
            prop="date"
            label="标记时间"
            :formatter="(_row, _col, val) => dayjs(val).format('YYYY-MM-DD HH:mm:ss')"
          />
          <ElTableColumn prop="bossName" label="BOSS" width="64" />
          <ElTableColumn prop="markReason" label="标记原因" width="250">
            <template #default="{ row }">
              <template
                v-if="
                  [
                    MarkAsNotSuitReason.BOSS_INACTIVE,
                    MarkAsNotSuitReason.USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON
                  ].includes(row.markReason)
                "
              >
                <strong>{{ markReasonTopicMap[row.markReason] }}</strong>
                <pre class="m-0 of-auto">{{ formatMarkReason(row) }}</pre>
              </template>
              <template v-else-if="row.markReason === MarkAsNotSuitReason.JOB_NOT_SUIT">
                <strong>{{ markReasonTopicMap[row.markReason] }}</strong>
              </template>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="experienceName" label="工作经验" />
          <ElTableColumn
            label="薪资"
            :formatter="
              (row, _col, _val) =>
                `${row.salaryLow}-${row.salaryHigh}k` +
                (row.salaryMonth ? `* ${row.salaryMonth}薪` : '')
            "
          />
          <ElTableColumn label="职位信息" fixed="right" :width="120">
            <template #default="{ row }">
              <ElButton
                link
                type="primary"
                size="small"
                @click="handleViewJobSnapshotButtonClick(row)"
                >快照</ElButton
              >
              <ElButton
                link
                type="primary"
                size="small"
                @click="handleViewJobOnlineButtonClick(row.encryptJobId)"
                >线上</ElButton
              >
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </div>
    <div class="flex flex-0 flex-justify-between pt10px pb10px">
      <div class="w100px">
        <el-button :loading="isTableLoading" size="small" @click="getMarkAsNotSuitRecord"
          >刷新</el-button
        >
      </div>
      <ElPagination
        v-model:current-page="pagination.pageNo"
        v-model:page-size="pagination.pageSize"
        :page-sizes="pageSizeList"
        small
        :disabled="isTableLoading"
        layout="total, sizes, prev, pager, next, jumper"
        :total="pagination.totalItemCount"
        @size-change="getMarkAsNotSuitRecord"
        @current-change="getMarkAsNotSuitRecord"
      />
      <div class="w100px" />
    </div>
    <ElDrawer v-model="drawVisibleModelValue" size="400px">
      <JobInfoSnapshot
        v-if="selectedJobInfoForViewSnapshot"
        :job-info="selectedJobInfoForViewSnapshot"
        @closed="selectedJobInfoForViewSnapshot = null"
      />
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, h } from 'vue'
import { ElTable, ElTableColumn, ElButton, ElPagination, ElDrawer } from 'element-plus'
import { type VMarkAsNotSuitLog } from '@geekgeekrun/sqlite-plugin/src/entity/VMarkAsNotSuitLog'
import dayjs from 'dayjs'
import { PageReq, PagedRes } from '../../../../common/types/pagination'
import JobInfoSnapshot from '../../features/JobInfoSnapshot/index.vue'
import { MarkAsNotSuitReason } from '@geekgeekrun/sqlite-plugin/src/enums'

const tableData = ref<VMarkAsNotSuitLog[]>([])
const pageSizeList = ref<number[]>([100, 200, 300, 400])
const pagination = ref<Omit<PageReq & PagedRes<unknown>, 'data'>>({
  pageNo: 1,
  pageSize: pageSizeList.value[0],
  totalItemCount: 0
})
const getRowKey = (row: VMarkAsNotSuitLog) => {
  return `${row.encryptJobId}@${row.date}`
}
const tableRef = ref<InstanceType<typeof ElTable>>()
const isTableLoading = ref(false)
async function getMarkAsNotSuitRecord() {
  try {
    isTableLoading.value = true
    const { data: res } = (await electron.ipcRenderer.invoke('get-mark-as-not-suit-record', {
      pageNo: pagination.value.pageNo,
      pageSize: pagination.value.pageSize
    })) as { data: PagedRes<VMarkAsNotSuitLog> }
    tableData.value = res.data
    pagination.value = {
      totalItemCount: res.totalItemCount,
      pageNo: res.pageNo,
      pageSize: pagination.value.pageSize
    }
  } catch (err) {
    console.log(err)
    tableData.value = []
  } finally {
    tableRef.value?.setScrollTop(0)
    isTableLoading.value = false
  }
}

getMarkAsNotSuitRecord()

const tableMaxHeight = ref<number | undefined>(undefined)
const tableContainerEl = ref<HTMLElement>()
const setTableMaxHeight = () =>
  (tableMaxHeight.value = tableContainerEl.value?.clientHeight ?? undefined)
onMounted(() => {
  setTableMaxHeight()
  const ro = new ResizeObserver(() => setTableMaxHeight())
  ro.observe(tableContainerEl.value!)
  onBeforeUnmount(() => {
    ro.disconnect()
  })
})

async function handleViewJobOnlineButtonClick(encryptJobId: string) {
  return await electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
    url: `https://www.zhipin.com/job_detail/${encryptJobId}.html`
  })
}

const drawVisibleModelValue = ref(false)
const selectedJobInfoForViewSnapshot = ref<VMarkAsNotSuitLog | null>(null)

function handleViewJobSnapshotButtonClick(record: VMarkAsNotSuitLog) {
  selectedJobInfoForViewSnapshot.value = record
  drawVisibleModelValue.value = true
}

const markReasonTopicMap = {
  [MarkAsNotSuitReason.BOSS_INACTIVE]: 'Boss不活跃',
  [MarkAsNotSuitReason.USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON]: '手动标记不合适',
  [MarkAsNotSuitReason.JOB_NOT_SUIT]: '职位不合适'
}

function formatMarkReason(row: VMarkAsNotSuitLog) {
  switch (row.markReason) {
    case MarkAsNotSuitReason.BOSS_INACTIVE: {
      const extInfo = (() => {
        try {
          return JSON.parse(row.extInfo)
        } catch {
          return null
        }
      })()
      return [
        extInfo?.bossActiveTimeDesc && `Boss活跃情况：${extInfo.bossActiveTimeDesc}`,
        extInfo?.chosenReasonInUi?.text && `Boss选项内容：${extInfo.chosenReasonInUi.text}`
      ]
        .filter(Boolean)
        .join('\n')
    }
    case MarkAsNotSuitReason.USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON: {
      const extInfo = (() => {
        try {
          return JSON.parse(row.extInfo)
        } catch {
          return null
        }
      })()
      return [extInfo?.chosenReasonInUi?.text && `Boss选项内容：${extInfo.chosenReasonInUi.text}`]
        .filter(Boolean)
        .join('\n')
    }
    default: {
      return ''
    }
  }
}
</script>

<style scoped lang="scss">
.page-wrap {
  margin: 0 auto;
  max-width: 1000px;
  max-height: 100vh;
  overflow: hidden;
  padding-left: 20px;
  padding-top: 20px;
  :deep(.el-drawer) {
    .el-drawer__header {
      padding: 16px 20px;
      margin-bottom: 0;
    }
    .el-drawer__body {
      padding: 0;
      margin: 0 0 20px 20px;
      padding-right: 20px;
    }
  }
}
</style>
