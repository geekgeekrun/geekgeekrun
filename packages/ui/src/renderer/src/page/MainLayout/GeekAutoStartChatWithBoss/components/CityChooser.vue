<template>
  <div w-full>
    <slot
      :model-value="modelValue"
      :show-dialog="showDialog"
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
          :style="{ height: '260px', overflow: 'auto' }"
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
            alignItems: multiple ? 'end' : 'center',
            justifyContent: 'space-between'
          }"
        >
          <div flex flex-1 mr12px text-left flex-col>
            <template v-if="selectedCities?.length">
              <div
                flex
                flex-items-center
                font-size-14px
                flex-0
                ws-nowrap
                :class="{ mb10px: multiple }"
              >
                <el-button
                  v-if="multiple && selectedCities?.length"
                  type="danger"
                  size="small"
                  @click="handleClearSelectedCitiesInDialog"
                  >清空已选择的所有城市</el-button
                >
                <template v-if="!multiple">
                  <span ml6px font-size-13px class="color-#999">已选择：</span>
                  <el-tag
                    closable
                    @close="
                      () => {
                        selectedCities = null
                        gtagRenderer('remove_selected_cities_in_dialog_clicked', {
                          gtShowScene: props.gtShowScene,
                          multiple: Boolean(multiple)
                        })
                      }
                    "
                    >{{ selectedCities }}</el-tag
                  >
                </template>
              </div>
              <div v-if="multiple" flex flex-1 flex-wrap gap-6px of-auto max-h-160px>
                <span font-size-13px class="color-#999" flex items-center>已选择：</span>
                <el-tag
                  v-for="(city, index) in selectedCities"
                  :key="city"
                  closable
                  @close="
                    () => {
                      ;(selectedCities ?? []).splice(index, 1)
                      gtagRenderer('remove_selected_cities_in_dialog_clicked', {
                        gtShowScene: props.gtShowScene,
                        multiple: Boolean(multiple)
                      })
                    }
                  "
                >
                  {{ city }}</el-tag
                >
              </div>
            </template>
          </div>
          <div flex-0 ws-nowrap>
            <el-button @click="handleCancelClicked">取消</el-button>
            <el-button type="primary" @click="handleConfirmClicked">确定</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, PropType, ref } from 'vue'
import { cityGroups, presentationDataReady } from '@renderer/domain/presentation-data'
import { gtagRenderer } from '@renderer/utils/gtag'
import { ElMessage, ElRadioGroup } from 'element-plus'

const props = defineProps({
  modelValue: {
    type: [Array, String] as PropType<string[] | string | null>,
    default: null
  },
  multiple: {
    type: Boolean,
    default: true
  },
  gtShowScene: {
    type: String
  }
})
const emits = defineEmits(['update:modelValue'])
const hotCityList = computed(() => cityGroups.zpData.hotCityList ?? [])

const activeTabName = ref('热门城市')
const isDialogVisible = ref(false)
const selectedCities = ref(null)

const cityGroupsByAlphabetMap = computed(() => {
  const result = new Map(['ABCDE', 'FGHJ', 'KLMN', 'PQRST', 'WXYZ'].map((item) => [item, []]))
  for (const group of cityGroups.zpData.cityGroup ?? []) {
    const targetKey = [...result.keys()].find((item) => item.includes(group.firstChar))
    if (targetKey) result.get(targetKey)?.push(group)
  }
  return result
})

function showDialog() {
  if (!presentationDataReady.value) {
    ElMessage.warning('城市筛选数据仍在加载，请稍后重试')
    return
  }
  isDialogVisible.value = true
}

function handleDialogOpen() {
  activeTabName.value = '热门城市'
  selectedCities.value = props.multiple ? [...(props.modelValue ?? [])] : props.modelValue
  gtagRenderer('choose_city_dialog_open', { gtShowScene: props.gtShowScene })
}

function handleCancelClicked() {
  gtagRenderer('choose_city_cancel_button_clicked', { gtShowScene: props.gtShowScene })
  isDialogVisible.value = false
}
function handleConfirmClicked() {
  gtagRenderer('choose_city_confirm_button_clicked', {
    gtShowScene: props.gtShowScene,
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
  gtagRenderer('choose_city_dialog_closed', { gtShowScene: props.gtShowScene })
}

function handleClearSelectedCitiesInModelValue() {
  emits('update:modelValue', (selectedCities.value = props.multiple ? [] : null))
  gtagRenderer('clear_selected_cities_in_mv_clicked', { gtShowScene: props.gtShowScene })
}
function handleClearSelectedCitiesInDialog() {
  selectedCities.value = props.multiple ? [] : null
  gtagRenderer('clear_selected_cities_in_dialog_clicked', { gtShowScene: props.gtShowScene })
}
</script>
