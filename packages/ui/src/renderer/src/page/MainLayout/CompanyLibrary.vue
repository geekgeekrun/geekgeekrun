<template>
  <div class="page-wrap flex flex-col of-hidden">
    <div v-loading="isTableLoading" class="flex-1 of-hidden">
      <div ref="tableContainerEl" class="h-100% of-hidden">
        <ElTable
          ref="tableRef"
          :max-height="tableMaxHeight"
          :data="tableData"
          row-key="encryptCompanyId"
          size="small"
          table-layout="auto"
          highlight-current-row
        >
          <ElTableColumn prop="name" label="公司" />
          <ElTableColumn
            :formatter="(row) => formatCompanyScale(row.scaleLow, row.scaleHigh)"
            label="公司规模"
          />
          <ElTableColumn prop="industryName" label="所在行业" />
          <ElTableColumn prop="stageName" label="融资情况" />
        </ElTable>
      </div>
    </div>
    <div class="flex flex-0 flex-justify-between pt10px pb10px">
      <div class="w100px">
        <el-button
          :loading="isTableLoading"
          size="small"
          @click="
            () => {
              gtagRenderer('company_library_refresh_clicked')
              getCompanyLibrary()
            }
          "
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
        @size-change="getCompanyLibrary"
        @current-change="getCompanyLibrary"
      />
      <div class="w100px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElTable, ElTableColumn, ElButton, ElPagination } from 'element-plus'
import { type VChatStartupLog } from '@geekgeekrun/sqlite-plugin/src/entity/VChatStartupLog'
import { PageReq, PagedRes } from '../../../../common/types/pagination'
import { formatCompanyScale } from '@geekgeekrun/sqlite-plugin/src/utils/parser'
import { gtagRenderer } from '@renderer/utils/gtag'

const tableData = ref<VChatStartupLog[]>([])
const pageSizeList = ref<number[]>([100, 200, 300, 400])
const pagination = ref<Omit<PageReq & PagedRes<unknown>, 'data'>>({
  pageNo: 1,
  pageSize: pageSizeList.value[0],
  totalItemCount: 0
})
const getRowKey = (row: VChatStartupLog) => {
  return `${row.encryptJobId}@${row.date}`
}
const tableRef = ref<InstanceType<typeof ElTable>>()
const isTableLoading = ref(false)
async function getCompanyLibrary() {
  try {
    gtagRenderer('company_library_request_sent', {
      page_no: pagination.value.pageNo,
      page_size: pagination.value.pageSize,
    })
    isTableLoading.value = true
    const { data: res } = (await electron.ipcRenderer.invoke('get-company-library', {
      pageNo: pagination.value.pageNo,
      pageSize: pagination.value.pageSize
    })) as { data: PagedRes<VChatStartupLog> }
    tableData.value = res.data
    pagination.value = {
      totalItemCount: res.totalItemCount,
      pageNo: res.pageNo,
      pageSize: pagination.value.pageSize
    }
    gtagRenderer('company_library_request_success', {
      page_no: pagination.value.pageNo,
      page_size: pagination.value.pageSize,
    })
  } catch (err) {
    gtagRenderer('company_library_request_error', {
      err,
      page_no: pagination.value.pageNo,
      page_size: pagination.value.pageSize,
    })
    console.log(err)
    tableData.value = []
  } finally {
    tableRef.value?.setScrollTop(0)
    isTableLoading.value = false
  }
}

getCompanyLibrary()

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
