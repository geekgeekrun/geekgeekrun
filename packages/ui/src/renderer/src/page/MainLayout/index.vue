<template>
  <div class="flex h100vh">
    <div class="flex flex-col min-w200px w200px pt30px pl30px aside-nav of-hidden">
      <div class="nav-list flex-1 of-auto pl20px ml--20px">
        <RouterLink v-show="false" to="./TaskManager">任务管理</RouterLink>
        <div class="group-item">
          <div class="group-title">BOSS直聘</div>
          <div flex flex-col class="link-list">
            <RouterLink to="./GeekAutoStartChatWithBoss">
              自动开聊
              <el-tooltip
                placement="right"
                :enterable="false"
                @show="gtagRenderer('tooltip_show_for_nav_boss_b_entry')"
              >
                <template #content>
                  <div w-480px>
                    <div>扩列神器！按照你所设置的求职偏好，自动开聊推荐职位列表中的匹配的BOSS。</div>
                    <br />
                    <div>匹配步骤</div>
                    <ol m0 pl2em>
                      <li>
                        按照公司名称查找职位，查找到目标职位后，自动点击这个职位，右侧将会展示职位详情
                      </li>
                      <li>
                        检查BOSS活跃度
                        <ul pl2em>
                          <li>
                            如果BOSS活跃度为本月活跃或更往前的时间，则会把职位标记为不合适，一段时间内你将不会在BOSS上看到这个职位，且将会推荐新职位置换这个职位
                          </li>
                        </ul>
                      </li>
                      <li>
                        对职位名称、职位类型、职位描述进行匹配
                        <ul pl2em>
                          <li>如果匹配则自动点击开聊按钮</li>
                          <li>
                            不匹配则标记这个职位为不合适，一段时间内你将不会在BOSS上看到这个职位，且将会推荐新职位置换这个职位
                          </li>
                        </ul>
                      </li>
                    </ol>
                    <br />
                    <div>异常情况</div>
                    <ol m0 pl2em>
                      <li>
                        当前页面筛选条件下，如果没有更多职位，则自动切换备选筛选条件，以获取更多新职位
                      </li>
                      <li>
                        如当天开聊次数用完，本程序会暂停运行60分钟，之后尝试继续重新运行；如重新运行时间已在第二天，则将会继续开聊
                      </li>
                    </ol>
                  </div>
                </template>
                <QuestionFilled w-1em h-1em mr10px />
              </el-tooltip>
            </RouterLink>
            <RouterLink to="./ReadNoReplyReminder">
              已读不回自动复聊
              <el-tooltip
                placement="right"
                :enterable="false"
                @show="gtagRenderer('tooltip_show_for_rnrr_entry')"
              >
                <template #content>
                  <div w-480px>
                    <div>
                      BOSS不明原因已读不回？简历就是投不出去？<br />
                      已读不回自动复聊，提醒一下已读不回的 BOSS，助力把握每次机会
                    </div>
                    <br />
                    <div>匹配逻辑</div>
                    <div>在聊天列表中查找对你消息已读不回的BOSS，再发一条消息，多次复聊；同时：</div>
                    <ul m0 pl2em>
                      <li>如果设置了“跟进时限”，那么在这个时间之前活跃的聊天将不会被检查</li>
                      <li>
                        如果设置了“跟进间隔”，且再次检查时发现BOSS已读不回，且距离上次提醒时间间隔小于这个时间，那么聊天将暂时不会跟进，直到下次检查时距离上次提醒时间间隔大于这个时间
                      </li>
                    </ul>
                    <br />
                    <div>发送内容</div>
                    <ul m0 pl2em>
                      <li>“[盼回复]”表情</li>
                      <li>由大语言模型（根据简历及当前聊天上下文）生成的内容</li>
                    </ul>
                  </div>
                </template>
                <QuestionFilled w-1em h-1em mr10px />
              </el-tooltip>
            </RouterLink>
            <a href="javascript:void(0)" @click="handleClickLaunchBossLogin">
              编辑登录凭据<TopRight w-1em h-1em mr10px />
            </a>
            <a href="javascript:void(0)" @click="handleLaunchBossSite">
              手动逛<TopRight w-1em h-1em mr10px />
            </a>
          </div>
        </div>
        <hr class="group-divider" />
        <div class="group-item">
          <div class="group-title">全局设置</div>
          <div flex flex-col class="link-list">
            <a href="javascript:void(0)" @click="handleClickBrowserSetting">
              编辑浏览器偏好<TopRight w-1em h-1em mr10px />
            </a>
            <a href="javascript:void(0)" @click="handleClickConfigLlm">
              配置大语言模型
              <div>
                <el-tooltip
                  placement="right"
                  :enterable="false"
                  @show="gtagRenderer('tooltip_show_for_rnrr_entry')"
                >
                  <template #content>
                    <div class="font-size-12px">
                      支持
                      <span
                        class="pl6px pr6px pt4px pb2px color-white border-rd-full font-size-0.8em"
                        style="background-color: #3c4efd"
                        >DeepSeek-V3</span
                      >
                      <span
                        class="ml4px pl6px pr6px pt4px pb2px color-black border-rd-full font-size-0.8em"
                        style="background-color: #fff"
                        >GPT-4o mini</span
                      >
                      <span
                        class="ml4px pl6px pr6px pt4px pb2px color-white border-rd-full font-size-0.8em"
                        style="background-color: #462ac4"
                        >Qwen2.5</span
                      >
                      模型<br />支持多个“服务商-模型”组合按权重搭配使用
                    </div>
                  </template>
                  <QuestionFilled w-1em h-1em mr10px />
                </el-tooltip>
                <TopRight w-1em h-1em mr10px />
              </div>
            </a>
          </div>
        </div>
        <hr class="group-divider" />
        <div class="group-item">
          <div class="group-title">运行数据</div>
          <div flex flex-col class="link-list">
            <RouterLink to="./StartChatRecord">开聊记录</RouterLink>
            <RouterLink to="./MarkAsNotSuitRecord">标记不合适记录</RouterLink>
            <RouterLink to="./JobLibrary">职位库</RouterLink>
            <RouterLink to="./BossLibrary">BOSS库</RouterLink>
            <RouterLink to="./CompanyLibrary">公司库</RouterLink>
          </div>
        </div>
      </div>
      <div class="pt-16px pb-16px flex-0 font-size-12px">
        <div v-if="updateStore.availableNewRelease" mb16px>
          <div
            :style="{
              display: 'flex',
              alignItems: 'center'
            }"
          >
            最新版本: {{ updateStore.availableNewRelease.releaseVersion }}
            <img
              h12px
              ml10px
              :style="{
                filter: `saturate(1.5) brightness(1.5)`,
                transform: `translateY(-10px)`
              }"
              src="./resources/new.gif"
            />
          </div>
          <div class="update-button-area flex flex-items-center mt-8px">
            <el-button type="text" size="small" @click="handleDownloadNewReleaseClick"
              >从GitHub下载</el-button
            >
            |
            <el-button type="text" size="small" @click="handleViewNewReleaseClick"
              >了解更新内容</el-button
            >
          </div>
        </div>
        <div>
          <div>当前版本: {{ buildInfo.version }}({{ buildInfo.buildVersion }})</div>
          <div class="feedback-button-area flex flex-items-center mt-8px">
            <el-button type="text" size="small" @click="handleGotoProjectPageClick"
              >项目首页</el-button
            >
            |
            <el-button type="text" size="small" @click="handleFeedbackClick">反馈问题</el-button>
          </div>
        </div>
      </div>
    </div>
    <div class="router-view-wrap">
      <RouterView v-slot="{ Component }" class="flex-1 of-hidden">
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router'
import { TopRight, QuestionFilled } from '@element-plus/icons-vue'
import useBuildInfo from '@renderer/hooks/useBuildInfo'
import { debounce } from 'lodash'
import { gtagRenderer } from '@renderer/utils/gtag'
import { useUpdateStore, useTaskManagerStore } from '../../store/index'
import { ElMessage } from 'element-plus'

useRouter()

const { buildInfo } = useBuildInfo()
const handleFeedbackClick = () => {
  gtagRenderer('goto_feedback_clicked')
  electron.ipcRenderer.send('send-feed-back-to-github-issue')
}
const handleGotoProjectPageClick = () => {
  gtagRenderer('goto_project_github_clicked')
  electron.ipcRenderer.send('open-external-link', 'https://github.com/geekgeekrun/geekgeekrun')
}

const handleLaunchBossSite = debounce(
  async () => {
    gtagRenderer('launch_boss_site_clicked')
    return await electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
      url: `https://www.zhipin.com/`
    })
  },
  1000,
  { leading: true, trailing: false }
)

const updateStore = useUpdateStore()
function handleDownloadNewReleaseClick() {
  gtagRenderer('click_download_release_form_nav')
  electron.ipcRenderer.send('open-external-link', updateStore.availableNewRelease!.assetUrl)
}
function handleViewNewReleaseClick() {
  gtagRenderer('click_view_release_form_nav')
  electron.ipcRenderer.send('open-external-link', updateStore.availableNewRelease!.releasePageUrl)
}

const taskManagerStore = useTaskManagerStore()
void taskManagerStore

const handleClickLaunchBossLogin = async () => {
  gtagRenderer('launch_login_clicked')
  try {
    await electron.ipcRenderer.invoke('login-with-cookie-assistant')
    ElMessage({
      type: 'success',
      message: '登录凭据保存成功'
    })
  } catch {
    //
  }
}

const handleClickBrowserSetting = async () => {
  gtagRenderer('browser_setting_clicked')
  try {
    await electron.ipcRenderer.invoke('config-with-browser-assistant')
    ElMessage({
      type: 'success',
      message: '浏览器偏好保存成功'
    })
  } catch {
    //
  }
}

const handleClickConfigLlm = async () => {
  gtagRenderer('config_llm_clicked')
  try {
    await electron.ipcRenderer.invoke('llm-config')
  } catch (err) {
    console.log(err)
  }
}
</script>

<style lang="scss" scoped>
.aside-nav {
  background-image: linear-gradient(45deg, #eaf4f1, #dcf6f2);
  .nav-list {
    hr.group-divider {
      width: 100%;
      border: 0 solid;
      height: 1px;
      background-color: #b3c8c3;
      margin-top: 4px;
      margin-bottom: 4px;
      margin-right: 0;
    }
    .group-item {
      .group-title {
        color: #849492;
        font-size: 12px;
        padding: 0.25em 0;
      }
      .link-list {
        a {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 2em;
          box-sizing: border-box;
          padding-left: 1em;
          font-size: 14px;
          &.router-link-active {
            background-color: #fff;
            font-weight: 700;
            color: #2faa9e;
            border-radius: 9999px 0 0 9999px;
            position: relative;
            box-shadow: 0px 0px 10px rgba(50, 114, 108, 0.187);
          }
        }
      }
    }
  }
  .feedback-button-area,
  .update-button-area {
    :deep(.el-button) {
      height: fit-content;
      padding: 0;
      margin-left: 0;
    }
  }
}
.router-view-wrap {
  display: flex;
  flex: 1;
  height: 100%;
  box-shadow: -4px 1px 20px rgb(50 114 108 / 29%);
}
</style>
