<template>
  <div>
    <el-button p-0 h-auto flex size="small" type="text" :icon="Plus" @click="addCondition"
      >添加条件</el-button
    >
    <div class="job-combo-filter" mt-8px>
      <el-table
        size="small"
        :data="props.modelValue"
        border
        :style="{ maxWidth: '100%' }"
        :row-style="
          ({ row }) => {
            return {
              backgroundColor:
                duplicatedMap.get(getStaticCombineFilterKey(row))?.length > 1
                  ? '#fcd4b7'
                  : 'transparent'
            }
          }
        "
      >
        <template #empty>
          <div lh-1.5em>
            列表中没有条件，将仅使用默认的“初始空条件”为您筛选职位<br />
            你可以点击表格左上角“<el-button
              p-0
              h-auto
              size="small"
              type="text"
              :icon="Plus"
              @click="addCondition"
              >添加条件</el-button
            >”按钮，添加更多筛选条件。
          </div>
        </template>
        <el-table-column :resizable="false" label="" :width="80">
          <template #default="{ $index: index }">
            <div
              :style="{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                height: 'fit-content'
              }"
            >
              <el-button
                :disabled="index <= 0"
                style="margin: 0"
                circle
                size="small"
                :icon="ArrowUp"
                @click="moveConditionUp(index)"
              />
              <el-button
                :disabled="index >= modelValue?.length - 1"
                style="margin: 0"
                circle
                size="small"
                :icon="ArrowDown"
                @click="moveConditionDown(index)"
              />
              <el-button
                style="margin: 0"
                circle
                size="small"
                :icon="Delete"
                @click="removeCondition(index)"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column :resizable="false" label="薪资待遇" prop="salary">
          <template #default="{ row }">
            <el-select
              v-model="row.salary"
              :disabled="row.___itemType === 'empty-condition-placeholder'"
              clearable
              size="small"
            >
              <el-option
                v-for="it in conditions.salaryList.filter((it) => it.code !== 0)"
                :key="it.code"
                :value="it.code"
                :label="it.name"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column :resizable="false" label="工作经验" prop="experience">
          <template #default="{ row }">
            <el-select
              v-model="row.experience"
              :disabled="row.___itemType === 'empty-condition-placeholder'"
              clearable
              size="small"
            >
              <el-option
                v-for="it in conditions.experienceList.filter((it) => it.code !== 0)"
                :key="it.code"
                :value="it.code"
                :label="it.name"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column :resizable="false" label="学历要求" prop="degree">
          <template #default="{ row }">
            <el-select
              v-model="row.degree"
              :disabled="row.___itemType === 'empty-condition-placeholder'"
              clearable
              size="small"
            >
              <el-option
                v-for="it in conditions.degreeList.filter((it) => it.code !== 0)"
                :key="it.code"
                :value="it.code"
                :label="it.name"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column :resizable="false" label="公司行业" :width="200" prop="industry">
          <template #default="{ row }">
            <el-select
              v-model="row.industry"
              :disabled="row.___itemType === 'empty-condition-placeholder'"
              clearable
              size="small"
            >
              <el-option-group
                v-for="group in industryFilterExemption"
                :key="group.code"
                :label="group.name"
              >
                <el-option
                  v-for="item in group.subLevelModelList"
                  :key="item.code"
                  :label="item.name"
                  :value="item.code"
                />
              </el-option-group>
            </el-select>
          </template>
        </el-table-column>
        <el-table-column :resizable="false" label="公司规模" prop="scale">
          <template #default="{ row }">
            <el-select
              v-model="row.scale"
              :disabled="row.___itemType === 'empty-condition-placeholder'"
              clearable
              size="small"
            >
              <el-option
                v-for="it in conditions.scaleList.filter((it) => it.code !== 0)"
                :key="it.code"
                :value="it.code"
                :label="it.name"
              />
            </el-select>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div
      v-if="
        Array.from(duplicatedMap.values()).some((it) => {
          return it.length > 1
        })
      "
      color-orange
      font-size-12px
    >
      列表中被橙色高亮的条件存在重复项，相关重复项将被合并，运行时遍历顺序以第一次出现为准
    </div>
  </div>
</template>

<script lang="ts" setup>
import conditions from '@geekgeekrun/geek-auto-start-chat-with-boss/internal-config/job-filter-conditions-20241002.json'
import industryFilterExemption from '@geekgeekrun/geek-auto-start-chat-with-boss/internal-config/job-filter-industry-filter-exemption-20241002.json'
import { ArrowUp, ArrowDown, Delete, Plus } from '@element-plus/icons-vue'
import { computed, PropType } from 'vue'

import { getStaticCombineFilterKey } from '@geekgeekrun/geek-auto-start-chat-with-boss/combineCalculator.mjs'

const props = defineProps({
  modelValue: {
    type: Array as PropType<
      Array<{
        salary: number | null
        experience: number | null
        degree: number | null
        industry: number | null
        scale: number | null
      }>
    >,
    default: () => []
  },
  isSkipEmptyConditionForCombineRecommendJobFilter: {
    type: Boolean
  }
})

// fix for misspell of scale property.
for (const condition of props.modelValue) {
  if ((condition as any).scaleList && !condition.scale) {
    condition.scale = (condition as any).scaleList
    delete (condition as any).scaleList
  }
}

function getNewConditionItem() {
  return {
    salary: null,
    experience: null,
    degree: null,
    industry: null,
    scale: null
  }
}

function addCondition() {
  props.modelValue?.push(getNewConditionItem())
  // gtagRenderer('resume_work_exp_added')
}
function moveConditionUp(index) {
  ;[props.modelValue[index], props.modelValue[index - 1]] = [
    props.modelValue[index - 1],
    props.modelValue[index]
  ]
  // gtagRenderer('resume_work_exp_moved_up')
}

function moveConditionDown(index) {
  ;[props.modelValue[index], props.modelValue[index + 1]] = [
    props.modelValue[index + 1],
    props.modelValue[index]
  ]
  // gtagRenderer('resume_work_exp_moved_down')
}

function removeCondition(index) {
  props.modelValue?.splice(index, 1)
  // gtagRenderer('resume_work_exp_removed')
}
const duplicatedMap = computed(() => {
  const map = new Map()
  for (const condition of props.modelValue ?? []) {
    const key = getStaticCombineFilterKey(condition)
    if (!map.has(key)) {
      map.set(key, [])
    }
    const arr = map.get(key)
    arr.push(condition)
  }
  return map
})
</script>

<style lang="scss" scoped>
.job-combo-filter {
  display: flex;
  width: 100%;
  gap: 10px;
  .filter-item {
    flex: 1;
  }
}
</style>
