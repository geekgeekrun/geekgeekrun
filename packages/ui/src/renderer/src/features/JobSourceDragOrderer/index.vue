<template>
  <draggable
    :model-value="modelValue"
    class="list-group"
    :component-data="{
      tag: 'ul',
      type: 'transition-group',
      name: !drag ? 'flip-list' : null
    }"
    :group="{ name: 'parent', put: ['parent'] }"
    v-bind="dragOptions"
    handle=".drag-handle-wrap"
    @update:model-value="emit('update:model-value', $event)"
    @start="drag = true"
    @end="
      () => {
        drag = false
        setTimeout(() => {
          gtagRenderer('job-source-dragged', {
            sourceOrder: modelValue?.map((it) => JobSource[it.type]).join(','),
            enabledSourceOrder: modelValue
              ?.filter?.((it) => !!it.enabled)
              ?.map((it) => JobSource[it.type])
              ?.join(',')
          })
        }, 50)
      }
    "
  >
    <template #item="{ element }">
      <li class="list-group-item">
        <div flex flex-items-center>
          <span class="drag-handle-wrap">
            <span class="drag-handle" />
          </span>
          <span class="inner-content">
            <div flex w-full flex-1>
              <template
                v-if="
                  element.type === 'search' &&
                  (!element?.children?.length ||
                    element?.children?.every((it) => !(it.enabled && !!it.keyword?.trim())))
                "
              >
                <el-switch
                  model-value="false"
                  mr10px
                  disabled
                  active-text="启用"
                  inactive-text="禁用"
                  inline-prompt
                  @click="
                    () => {
                      if (!element?.children?.length) {
                        Message.info({
                          message: '请添加一个要搜索的关键词',
                          grouping: true
                        })
                      } else if (
                        element?.children?.every((it) => !(it.enabled && !!it.keyword?.trim()))
                      ) {
                        Message.info({
                          message: '请启用一个要搜索的关键词',
                          grouping: true
                        })
                      }
                      gtagRenderer('job-source-switch-ph-clicked', { type: element.type })
                    }
                  "
                />
                {{ element.label }}
              </template>
              <template v-else>
                <el-switch
                  v-model="element.enabled"
                  mr10px
                  active-text="启用"
                  inactive-text="禁用"
                  inline-prompt
                  @change="
                    (v) => gtagRenderer('job-source-switch-changed', { type: element.type, v })
                  "
                />
                {{ element.label }}
              </template>
            </div>
            <div v-if="element.type === 'search'">
              <div flex flex-items-center>
                <span color-orange align-self-end mr10px>
                  {{ getSearchSourceTipText(element) }}
                </span>
                <el-button
                  p-0
                  h-fit
                  type="text"
                  @click="
                    () => {
                      addSearchKeyword(element)
                      gtagRenderer('job-source-search-kw-added', {
                        kwListLength: element.children?.length
                      })
                    }
                  "
                  >添加关键词</el-button
                >
              </div>
            </div>
          </span>
        </div>
        <div v-if="element.type === 'search' && element?.children?.length">
          <draggable
            v-model="element.children"
            class="list-group"
            :component-data="{
              tag: 'ul',
              type: 'transition-group',
              name: !drag ? 'flip-list' : null
            }"
            :group="{ name: 'child', put: ['child'] }"
            v-bind="dragOptions"
            handle=".drag-handle-wrap"
            @start="drag = true"
            @end="
              () => {
                drag = false
                setTimeout(() => {
                  gtagRenderer('job-source-search-kw-dragged', {
                    kwListLength: element.children?.length
                  })
                }, 50)
              }
            "
          >
            <template #item="{ element: searchItem, index }">
              <li class="list-group-item">
                <div flex flex-items-center>
                  <span class="drag-handle-wrap">
                    <span class="drag-handle" />
                  </span>
                  <span class="inner-content">
                    <div flex w-full>
                      <el-switch
                        v-if="element.enabled && searchItem.keyword?.trim()"
                        v-model="searchItem.enabled"
                        mr10px
                        active-text="启用"
                        inactive-text="禁用"
                        inline-prompt
                        @change="(v) => gtagRenderer('job-source-search-kw-switch-changed', { v })"
                      />
                      <el-switch
                        v-else
                        disabled
                        :model-value="false"
                        mr10px
                        active-text="启用"
                        inactive-text="禁用"
                        inline-prompt
                        @click="
                          () => {
                            if (!searchItem.keyword?.trim()) {
                              Message.info({
                                message: '该条关键词为空，请输入要搜索的关键词',
                                grouping: true
                              })
                            } else if (!element.enabled) {
                              Message.info({
                                message: '请启用“通过搜索找到的职位”来源',
                                grouping: true
                              })
                            }
                            gtagRenderer('job-source-search-kw-switch-ph-clicked')
                          }
                        "
                      />
                      <el-input
                        v-model="searchItem.keyword"
                        maxlength="100"
                        @blur="
                          () => {
                            searchItem.keyword = searchItem.keyword?.trim() ?? ''
                            gtagRenderer('job-source-search-kw-input-blurred', {
                              contentLength: searchItem.keyword?.length
                            })
                          }
                        "
                      />
                    </div>
                    <el-button
                      p-0
                      ml-10px
                      h-fit
                      type="danger"
                      link
                      @click="
                        () => {
                          removeSearchKeywordByIndex(element, index)
                          gtagRenderer('job-source-search-kw-removed', {
                            itemIndex: index,
                            contentLength: searchItem.keyword?.length
                          })
                        }
                      "
                      >删除</el-button
                    >
                  </span>
                </div>
              </li>
            </template>
          </draggable>
        </div>
      </li>
    </template>
  </draggable>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import draggable from 'vuedraggable'
import { ElMessage as Message } from 'element-plus'
import { gtagRenderer } from '@renderer/utils/gtag'
import { JobSource } from '@geekgeekrun/sqlite-plugin/src/enums'
const props = defineProps({
  modelValue: {
    type: Array
  }
})

const setTimeout = globalThis.setTimeout.bind(globalThis)

const emit = defineEmits(['update:model-value'])

const drag = ref(false)

const dragOptions = computed(() => {
  return {
    animation: 200,
    disabled: false,
    ghostClass: 'ghost'
  }
})

function addSearchKeyword(item) {
  if (!item.children) {
    item.children = []
  }
  item.enabled = true
  item.children.push({
    type: 'search-kw',
    enabled: true,
    keyword: ''
  })
}

function removeSearchKeywordByIndex(item, index) {
  item.children?.splice(index, 1)
}
const searchKeywordCountMap = computed(() => {
  const target = props.modelValue?.find((it) => it.type === 'search' && it.enabled)
  if (!target || !target?.children?.length) {
    return {}
  }
  const map = {}
  target.children?.forEach((it) => {
    if (!it.keyword) {
      return
    }
    if (!map[it.keyword]) {
      map[it.keyword] = 0
    }
    map[it.keyword]++
  })

  return map
})

const getSearchSourceTipText = (element) => {
  if (!element?.children?.length) {
    return `添加一个关键词后方可启用->`
  }
  const seg: string[] = []
  if (element.enabled) {
    if (element.children?.every((it) => !(it.enabled && !!it.keyword?.trim()))) {
      seg.push(`启用下方任一非空项后方可启用`)
    } else if (element.children?.some((it) => it.enabled && !it.keyword?.trim())) {
      seg.push(`空项会被跳过`)
    }
    if (Object.values(searchKeywordCountMap.value).some((n) => n > 1)) {
      seg.push(`重复项仅取第一个启用的项`)
    }
  }
  return seg.join('；')
}
</script>

<style lang="scss" scoped>
.ghost {
  opacity: 0.5;
  filter: blur(2px);
}

.list-group {
  line-height: 32px;
  min-height: 20px;
  .list-group {
    margin-left: 20px;
  }
  .list-group-item {
    background-color: #fff;
    list-style: none;
    display: flex;
    flex-direction: column;
    padding-top: 6px;
    padding-bottom: 6px;
    padding-right: 10px;
    border: 1px solid var(--el-card-border-color);
    margin-top: 6px;
    margin-bottom: 6px;
    box-shadow: var(--el-box-shadow-light);
    border-radius: 4px;
    .inner-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      ::v-deep(.el-checkbox) {
        .el-checkbox__label {
          width: 100%;
        }
      }
    }
    .drag-handle-wrap {
      display: flex;
      justify-content: flex-end;
      width: 25px;
      height: 1em;
      cursor: grab;
      margin-right: 4px;
      .drag-handle {
        width: 20px;
        background-image: linear-gradient(
          90deg,
          transparent 35%,
          var(--el-card-border-color) 35%,
          var(--el-card-border-color) 45%,
          transparent 45%,
          transparent 55%,
          var(--el-card-border-color) 55%,
          var(--el-card-border-color) 65%,
          transparent 65%,
          transparent 100%
        );
      }
    }
  }
}
</style>
