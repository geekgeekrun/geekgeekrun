<template>
  <div class="llm-config-page">
    <div class="main-wrapper">
      <main>
        <div class="mt1em mb1em">
          <div class="flex flex-items-center flex-justify-between">
            <div>大语言模型设置</div>
            <el-dropdown @command="(item) => openExternalLink(item.url)">
              <el-button size="small"
                >申请 API Secret <el-icon class="el-icon--right"><arrow-down /></el-icon
              ></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="item in providerList" :key="item.name" :command="item">{{
                    item.name
                  }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
        <el-alert type="info" :closable="false" mb20px line-height-1.25em>
          <ul pl16px>
            <li>
              请确保当前服务商提供的模型支持<a
                :style="{
                  color: 'var(--el-color-primary)'
                }"
                href="javascript:void(0)"
                @click.prevent="
                  openExternalLink('https://api-docs.deepseek.com/zh-cn/api/create-chat-completion')
                "
                >对话补全</a
              >且兼容
              <a
                :style="{
                  color: 'var(--el-color-primary)'
                }"
                href="javascript:void(0)"
                @click.prevent="openExternalLink('https://www.npmjs.com/package/openai')"
                >OpenAI SDK</a
              >
            </li>
            <li><b class="color-red">暂不支持推理模型</b>（例如 DeepSeek-R1）</li>
            <li>
              请自行确保您所接入的服务商能够保护您的隐私。<b class="color-red"
                >此处所列举“服务商-模型”由第三方提供，仅供配置参考，不能保证它们能够合法使用您的数据，不表示本程序认可相关模型</b
              >
            </li>
          </ul>
        </el-alert>
        <el-form
          ref="formRef"
          :model="formContent"
          :rules="formRules"
          label-position="top"
          class="llm-config-form"
        >
          <div v-for="(conf, index) in formContent" :key="index" class="flex gap12px">
            <div
              v-if="formContent.length > 1"
              :style="{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                height: 'fit-content',
                marginTop: '10px'
              }"
            >
              <el-button
                :disabled="index <= 0"
                style="margin: 0"
                circle
                size="small"
                :icon="ArrowUp"
                @click="moveConfigUp(index)"
              />
              <el-button
                :disabled="index >= formContent.length - 1"
                style="margin: 0"
                circle
                size="small"
                :icon="ArrowDown"
                @click="moveConfigDown(index)"
              />
              <el-button
                :disabled="1 >= formContent.length"
                style="margin: 0"
                circle
                size="small"
                :icon="Delete"
                @click="removeConfig(index)"
              />
            </div>
            <div class="w-full">
              <el-form-item prop="providerCompleteApiUrl">
                <div
                  class="el-form-item__label flex-items-center flex-justify-between w-full pr0px"
                  :style="{ display: 'flex' }"
                >
                  <div>服务提供商 Base Url</div>
                  <el-dropdown @command="(item) => handlePresetClick(item, index)">
                    <el-button size="small"
                      >配置模板 <el-icon class="el-icon--right"><arrow-down /></el-icon
                    ></el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          v-for="item in llmPresetList"
                          :key="item.name"
                          :command="item"
                          >{{ item.name }}</el-dropdown-item
                        >
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
                <el-input
                  ref="firstInputRefList"
                  v-model="conf.providerCompleteApiUrl"
                  :autosize="{
                    minRows: 10,
                    maxRows: 10
                  }"
                  font-size-12px
                ></el-input>
              </el-form-item>
              <el-form-item prop="model" label="要使用的模型（model参数）">
                <el-input
                  v-model="conf.model"
                  :autosize="{
                    minRows: 10,
                    maxRows: 10
                  }"
                  font-size-12px
                ></el-input>
              </el-form-item>
              <el-form-item prop="providerApiSecret" label="从服务提供商处获取的 API Secret">
                <el-input
                  v-model="conf.providerApiSecret"
                  :autosize="{
                    minRows: 10,
                    maxRows: 10
                  }"
                  font-size-12px
                ></el-input>
              </el-form-item>
              <div v-if="formContent.length > 1" class="serve-weight-config">
                <div class="flex">
                  <el-form-item prop="enabled">
                    <div class="el-form-item__label">启用</div>
                    <el-checkbox
                      v-model="conf.enabled"
                      :autosize="{
                        minRows: 10,
                        maxRows: 10
                      }"
                      font-size-12px
                    ></el-checkbox>
                  </el-form-item>
                  <el-form-item prop="serveWeight" class="ml40px">
                    <div class="el-form-item__label">权重</div>
                    <el-input-number
                      v-model="conf.serveWeight"
                      :autosize="{
                        minRows: 10,
                        maxRows: 10
                      }"
                      :min="0"
                      :max="100"
                      :step="1"
                      step-strictly
                      :precision="0"
                      font-size-12px
                      placeholder="0 ~ 100"
                    ></el-input-number>
                  </el-form-item>
                </div>
                <div class="flex">
                  <!-- <el-form-item class="ml20px">
                    <el-button type="text">测试设置</el-button>
                  </el-form-item> -->
                </div>
              </div>
              <div
                v-if="index !== formContent.length - 1"
                class="mt6px mb20px h1px"
                style="background-color: #dcdcdc"
              />
            </div>
          </div>
        </el-form>
      </main>
    </div>
    <footer pt10px pb10px flex flex-justify-center>
      <div w480px flex flex-justify-between>
        <div>
          <el-button font-size-12px type="text" @click="addConfig"
            >添加其它模型<span v-if="formContent.length <= 1">，以生成更随机的内容</span></el-button
          >
        </div>
        <div>
          <el-button @click="handleCancel">取消</el-button>
          <el-button type="primary" @click="handleSubmit">确定</el-button>
        </div>
      </div>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import {
  ElForm,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElIcon,
  ElButton,
  ElInput
} from 'element-plus'
import { ArrowUp, ArrowDown, Delete } from '@element-plus/icons-vue'
import { ref, onMounted, watch, nextTick } from 'vue'

interface LlmConfigItem {
  providerCompleteApiUrl: string
  providerApiSecret: string
  model: string
  serveWeight: number
  enabled: true
}

function getNewConfigItem(): LlmConfigItem {
  return {
    providerCompleteApiUrl: '',
    providerApiSecret: '',
    model: '',
    serveWeight: 10,
    enabled: true
  }
}
const formRef = ref<InstanceType<typeof ElForm>>()
const formContent = ref<LlmConfigItem[]>([getNewConfigItem()])

const formRules = {}

const handleCancel = () => {
  electron.ipcRenderer.send('close-llm-config')
}
const handleSubmit = async () => {
  electron.ipcRenderer.invoke('save-llm-config', JSON.parse(JSON.stringify(formContent.value)))
}

onMounted(async () => {
  const savedFileContent = (await electron.ipcRenderer.invoke('fetch-config-file-content'))
    ?.config?.['llm.json']
  if (!savedFileContent?.length) {
    return
  }
  const keyOfItem = Object.keys(getNewConfigItem())
  formContent.value = savedFileContent.map((it) => {
    const conf = {}
    for (const k of keyOfItem) {
      conf[k] = it[k]
    }
    return conf
  })
})

const llmPresetList: {
  name: string
  config: LlmConfigItem
}[] = [
  {
    name: '由 DeepSeek 提供的 DeepSeek-V3 模型',
    config: {
      model: 'deepseek-chat',
      providerApiSecret: '',
      providerCompleteApiUrl: 'https://api.deepseek.com/v1',
      serveWeight: 100,
      enabled: true
    }
  },
  {
    name: '由 火山引擎 提供的 DeepSeek-V3 模型',
    config: {
      model: 'deepseek-v3-250324',
      providerApiSecret: '',
      providerCompleteApiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      serveWeight: 100,
      enabled: true
    }
  },
  {
    name: '由 阿里云百炼 提供的 DeepSeek-V3 模型',
    config: {
      model: 'deepseek-v3',
      providerApiSecret: '',
      providerCompleteApiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      serveWeight: 100,
      enabled: true
    }
  },
  // TODO:
  // {
  //   name: '通过 Ollama 部署的 DeepSeek-R1（14B）模型',
  //   config: {
  //     model: 'deepseek-r1:14b',
  //     providerApiSecret: 'ollama',
  //     providerCompleteApiUrl: 'http://127.0.0.1:11434/v1',
  //     serveWeight: 10,
  //     enabled: true
  //   }
  // },
  {
    name: '由 free.v36.cm 提供的 GPT-4o mini 模型',
    config: {
      model: 'gpt-4o-mini',
      providerApiSecret: 'sk-P3kvkV6UZ9WMy6AH792480Fc5e1c4dAb8aE17b20FcAc4eC3',
      providerCompleteApiUrl: 'https://free.v36.cm/v1',
      serveWeight: 20,
      enabled: true
    }
  },
  {
    name: '通过 Ollama 部署的 Qwen2.5（7B）模型',
    config: {
      model: 'qwen2.5:7b',
      providerApiSecret: 'ollama',
      providerCompleteApiUrl: 'http://127.0.0.1:11434/v1',
      serveWeight: 10,
      enabled: true
    }
  }
]

const providerList: Array<{ name: string; url: string }> = [
  {
    name: 'DeepSeek',
    url: 'https://platform.deepseek.com/'
  },
  {
    name: '火山引擎 - 火山方舟',
    url: 'https://console.volcengine.com/ark'
  },
  {
    name: '阿里云百炼',
    url: 'https://bailian.console.aliyun.com/?tab=model#/api-key'
  },
  {
    name: 'OpenAI (国内可能不可用)',
    url: 'https://platform.openai.com/api-keys'
  },
  {
    name: 'FREE-CHATGPT-API (免费)',
    url: 'https://github.com/popjane/free_chatgpt_api'
  }
]

function handlePresetClick(selected: (typeof llmPresetList)[number], index) {
  for (const k of Object.keys(formContent.value[index])) {
    formContent.value[index][k] = selected.config[k]
  }
}

const firstInputRefList = ref<InstanceType<typeof ElInput>[]>([])
function addConfig() {
  formContent.value.push(getNewConfigItem())
  nextTick(() => {
    firstInputRefList.value[firstInputRefList.value.length - 1]?.focus()
  })
}
function moveConfigUp(index) {
  ;[formContent.value[index], formContent.value[index - 1]] = [
    formContent.value[index - 1],
    formContent.value[index]
  ]
}

function moveConfigDown(index) {
  ;[formContent.value[index], formContent.value[index + 1]] = [
    formContent.value[index + 1],
    formContent.value[index]
  ]
}

function removeConfig(index) {
  formContent.value.splice(index, 1)
}

watch(
  () => formContent.value.length,
  (nVal) => {
    if (nVal <= 1) {
      electron.ipcRenderer.send('update-window-size', {
        width: window.innerWidth,
        height: 500
      })
    } else {
      electron.ipcRenderer.send('update-window-size', {
        width: window.innerWidth,
        height: 730
      })
    }
  },
  {
    immediate: true
  }
)
const openExternalLink = (url) => {
  electron.ipcRenderer.send('open-external-link', url)
}

// function handleTestAvailability() {}
</script>

<style lang="scss" scoped>
.llm-config-page {
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  height: 100vh;
  .main-wrapper {
    flex: 1;
    overflow: auto;
    main {
      margin: 0 auto;
      max-width: 480px;
    }
  }
  footer {
    background-color: #f0f0f0;
  }
}
</style>

<style lang="scss">
.llm-config-form.el-form {
  .el-form-item__error--inline {
    margin-left: 0;
    margin-top: 10px;
  }
  .serve-weight-config {
    display: flex;
    justify-content: space-between;
    .el-form-item__label {
      margin-bottom: 0;
    }
    .el-form-item__content {
      display: flex;
      flex-wrap: nowrap;
    }
  }
}
</style>
