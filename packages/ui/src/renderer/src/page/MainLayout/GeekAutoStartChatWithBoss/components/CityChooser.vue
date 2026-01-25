<template>
  <div w-full>
    <slot
      :model-value="modelValue"
      :show-dialog="() => (isDialogVisible = true)"
      :clear-value="handleClearSelectedCitiesInModelValue"
    ></slot>
    <el-dialog
      v-model="isDialogVisible"
      width="1000px"
      title="请选择城市"
      :show-close="false"
      append-to-body
      @open="handleDialogOpen"
      @closed="handleDialogClosed"
    >
      <el-tabs v-model="activeTabName">
        <el-tab-pane
          :style="{ height: '300px', overflow: 'auto' }"
          label="热门城市"
          name="热门城市"
        >
          <el-checkbox-group v-if="multiple" v-model="selectedCities">
            <div
              :style="{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr'
              }"
            >
              <el-checkbox
                v-for="op in hotCityList.filter((it) => it.code !== 100010000)"
                :key="op.code"
                :label="op.name"
              >
                {{ op.name }}
              </el-checkbox>
            </div>
          </el-checkbox-group>
          <el-radio-group v-else v-model="selectedCities" w-full>
            <div
              w-full
              :style="{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr'
              }"
            >
              <el-radio
                v-for="op in hotCityList.filter((it) => it.code !== 100010000)"
                :key="op.code"
                :label="op.name"
              >
                {{ op.name }}
              </el-radio>
            </div>
          </el-radio-group>
        </el-tab-pane>
        <el-tab-pane
          v-for="it in cityGroupsByAlphabetMap.keys()"
          :key="it"
          :style="{ height: '300px', overflow: 'auto' }"
          :label="it"
          :value="it"
        >
          <div v-for="group in cityGroupsByAlphabetMap.get(it)" :key="group.firstChar">
            <div pt4px pb4px>{{ group.firstChar }}</div>
            <el-checkbox-group v-if="multiple" v-model="selectedCities">
              <div
                :style="{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr'
                }"
              >
                <el-checkbox v-for="op in group.cityList" :key="op.code" :label="op.name">
                  {{ op.name }}
                </el-checkbox>
              </div>
            </el-checkbox-group>
            <el-radio-group v-else v-model="selectedCities" w-full>
              <div
                w-full
                :style="{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr'
                }"
              >
                <el-radio v-for="op in group.cityList" :key="op.code" :label="op.name">
                  {{ op.name }}
                </el-radio>
              </div>
            </el-radio-group>
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <div
          :style="{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }"
        >
          <div>
            <el-button
              v-if="selectedCities?.length"
              type="danger"
              @click="handleClearSelectedCitiesInDialog"
              >清空已选择的所有城市</el-button
            >
          </div>
          <div>
            <el-button @click="handleCancelClicked">取消</el-button>
            <el-button type="primary" @click="handleConfirmClicked">确定</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { PropType, ref } from 'vue'
import cityGroupData from '@geekgeekrun/geek-auto-start-chat-with-boss/cityGroup.mjs'
import { gtagRenderer } from '@renderer/utils/gtag'
import { ElRadioGroup } from 'element-plus'

const props = defineProps({
  modelValue: {
    type: [Array, String] as PropType<string[] | string | null>,
    default: null
  },
  multiple: {
    type: Boolean,
    default: true
  }
})
const emits = defineEmits(['update:modelValue'])
const { hotCityList, cityGroup } = cityGroupData.zpData

const activeTabName = ref('热门城市')
const isDialogVisible = ref(false)
const selectedCities = ref(null)

const cityGroupsByAlphabetMap = ref(
  new Map(['ABCDE', 'FGHJ', 'KLMN', 'PQRST', 'WXYZ'].map((it) => [it, []]))
)
for (const group of cityGroup) {
  const { firstChar } = group
  const targetKey =
    [...cityGroupsByAlphabetMap.value.keys()].find((it) => it.includes(firstChar)) ?? null
  if (!targetKey) {
    if (!cityGroupsByAlphabetMap.value.get(targetKey)) {
      cityGroupsByAlphabetMap.value.set(targetKey, [])
    }
  }
  cityGroupsByAlphabetMap.value.get(targetKey)?.push(group)
}

function handleDialogOpen() {
  activeTabName.value = '热门城市'
  selectedCities.value = props.multiple ? [...(props.modelValue ?? [])] : props.modelValue
  gtagRenderer('choose_city_dialog_open')
}

function handleCancelClicked() {
  gtagRenderer('choose_city_cancel_button_clicked')
  isDialogVisible.value = false
}
function handleConfirmClicked() {
  gtagRenderer('choose_city_confirm_button_clicked', {
    value: Array.isArray(selectedCities.value)
      ? selectedCities.value.join(',')
      : selectedCities.value
  })
  isDialogVisible.value = false
  emits(
    'update:modelValue',
    props.multiple ? [...(selectedCities.value ?? [])] : selectedCities.value
  )
}
function handleDialogClosed() {
  selectedCities.value = props.multiple ? [] : null
  gtagRenderer('choose_city_dialog_closed')
}

function handleClearSelectedCitiesInModelValue() {
  emits('update:modelValue', (selectedCities.value = props.multiple ? [] : null))
  gtagRenderer('clear_selected_cities_in_mv_clicked')
}
function handleClearSelectedCitiesInDialog() {
  selectedCities.value = props.multiple ? [] : null
  gtagRenderer('clear_selected_cities_in_dialog_clicked')
}
</script>
