<template>
  <div>
    <el-form>
      <el-row>
        <el-col :span="6"><el-form-item label="公司">{{ jobInfo.companyName }}</el-form-item></el-col>
        <el-col :span="6"><el-form-item label="职位名称">{{ jobInfo.jobName }}</el-form-item></el-col>
        <el-col :span="6"><el-form-item label="职位分类">{{ jobInfo.positionName }}</el-form-item></el-col>
        <el-col :span="6"><el-form-item label="Boss及其身份">{{ jobInfo.bossName }} {{ jobInfo.bossTitle }}</el-form-item></el-col>
      </el-row>
    </el-form>
    <el-divider content-position="left">变更记录</el-divider>
    <el-table
      class="diff-table"
      :data="dataForRender"
      :row-style="getRowStyle"
    >
      <el-table-column prop="title" label="" width="150px" fixed />
      <el-table-column
        v-for="(item, index) in tableProps"
        :key="index"
        :prop="item.value"
        :label="item.label"
      >
        <template #header>
          <div class="diff-table-header">
            {{ transformUtcDateToLocalDate(item.value).format('YYYY-MM-DD HH:mm:ss') }}
            <el-tooltip
              content="待对比条目少于2个"
              :disabled="tableProps.length > 1"
              @show="gtagRenderer('tooltip_shown_about_compare_item_no_enough')"
            >
              <el-radio v-model="diffPivot" :label="item.value" :disabled="tableProps.length <= 1">作为diff基准</el-radio>
            </el-tooltip>
          </div>
        </template>
        <template #default="{ row }">
          <TextDiff :a="row[diffPivot]?.trim() ?? ''" :b="row[item.value]?.trim() ?? ''" />
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { PropType, computed, ref, watch } from 'vue'
import { type VChatStartupLog } from '@geekgeekrun/sqlite-plugin/src/entity/VChatStartupLog'
import { JobInfoChangeLog } from '@geekgeekrun/sqlite-plugin/src/entity/JobInfoChangeLog'
import { ElTable, ElTableColumn, ElForm, ElFormItem, ElRow, ElCol, ElDivider } from 'element-plus'
import TextDiff from '../../components/TextDiff.vue'
import { transformUtcDateToLocalDate } from '@geekgeekrun/utils/date.mjs'
import { gtagRenderer } from '@renderer/utils/gtag'

const props = defineProps({
  jobInfo: {
    type: Object as PropType<VChatStartupLog>,
    required: true
  },
  jobInfoHistoryList: {
    type: Array as PropType<JobInfoChangeLog[]>,
    default: () => []
  }
})

const tableProps = computed(() =>
  props.jobInfoHistoryList.map((it) => {
    return {
      label: it.__ggr_updateTime,
      value: it.__ggr_updateTime
    }
  })
)
/**
 *  定义映射字段表(最好取全量字段)
 * */
const mapObj = {
  // jobName: '职位名称',
  // positionName: '职位分类',
  experienceName: '工作经验',
  degreeName: '学历',
  salaryDesc: '薪资',
  postDescription: '职位描述',
  locationName: '工作地点',
  address: '地址'
}

const dataForRender = computed(() => {
  const newArr = []
  const keys = Object.keys(mapObj)
  keys.forEach((key, keyIndex) => {
    const obj = {
      title: mapObj[key]
    }
    tableProps.value.forEach((dateKey, dataKeyIndex) => {
      obj[dateKey.value] = props.jobInfoHistoryList[dataKeyIndex][keys[keyIndex]]
    })
    newArr.push(obj)
  })
  return newArr
})

const diffPivot = ref('')
watch(
  [() => props.jobInfoHistoryList, () => tableProps.value],
  () => {
    if (!props.jobInfoHistoryList.length || !tableProps.value.length) {
      diffPivot.value = ''
      return
    }
    diffPivot.value = tableProps.value[tableProps.value.length - 1].value
  },
  {
    immediate: true
  }
)

function getRowStyle ({ row }) {
  const propsToCompare = tableProps.value.map(it => it.value)
  for (let i = 0; i < propsToCompare.length - 1; i++) {
    if (
      row[propsToCompare[i]]?.trim() !==
      row[propsToCompare[i + 1]]?.trim()
    ) {
      return {
        backgroundColor: '#fffeef'
      }
    }
  }
  return {}
}
</script>

<style lang="scss" scoped>
.form {
  :deep(.el-form-item__label) {
    color: #999;
  }
}
.diff-table {
  .diff-table-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
}
</style>
<style lang="scss"></style>
