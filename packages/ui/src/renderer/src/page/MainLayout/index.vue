<template>
  <div class="flex h100vh">
    <div class="flex flex-col min-w200px w200px pt30px pl30px aside-nav of-hidden">
      <div class="nav-list flex-1 of-auto">
        <RouterLink v-show="false" to="./TaskManager">任务管理</RouterLink>
        <RouterLink to="./GeekAutoStartChatWithBoss">
          Boss炸弹
          <el-tooltip
            placement="right"
            :enterable="false"
            @show="gtagRenderer('tooltip_show_for_nav_boss_b_entry')"
          >
            <template #content>
              <div w-480px>
                <div>扩列神器！按照你所设置的求职偏好，自动开聊推荐职位列表中的匹配的Boss。</div>
                <br />
                <div>匹配步骤</div>
                <ol m0 pl2em>
                  <li>
                    按照公司名称查找职位，查找到目标职位后，自动点击这个职位，右侧将会展示职位详情
                  </li>
                  <li>
                    检查Boss活跃度
                    <ul pl2em>
                      <li>
                        如果Boss活跃度为本月活跃或更往前的时间，则会把职位标记为不合适，一段时间内你将不会在Boss上看到这个职位，且将会推荐新职位置换这个职位
                      </li>
                    </ul>
                  </li>
                  <li>
                    对职位名称、职位类型、职位描述进行匹配
                    <ul pl2em>
                      <li>如果匹配则自动点击开聊按钮</li>
                      <li>
                        不匹配则标记这个职位为不合适，一段时间内你将不会在Boss上看到这个职位，且将会推荐新职位置换这个职位
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
          已读不回提醒器
          <el-tooltip
            placement="right"
            :enterable="false"
            @show="gtagRenderer('tooltip_show_for_rnrr_entry')"
          >
            <template #content>
              <div w-480px>
                <div>
                  Boss不明原因已读不回？简历就是投不出去？<br />
                  已读不回提醒器，有事没事提醒一下已读不回的 Ta，助力把握每次机会
                </div>
                <br />
                <div>匹配逻辑</div>
                <div>在聊天列表中查找对你消息已读不回的Boss，再发一条消息，多次复聊；同时：</div>
                <ul m0 pl2em>
                  <li>如果设置了“跟进时限”，那么在这个时间之前活跃的聊天将不会被检查</li>
                  <li>
                    如果设置了“跟进间隔”，且再次检查时发现Boss已读不回，且距离上次提醒时间间隔小于这个时间，那么聊天将暂时不会跟进，直到下次检查时距离上次提醒时间间隔大于这个时间
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
        <hr w180px />
        <a href="javascript:void(0)" @click="handleLaunchBossSite">
          手动逛Boss<TopRight w-1em h-1em mr10px />
        </a>
        <hr w180px />
        <RouterLink to="./StartChatRecord">开聊记录</RouterLink>
        <RouterLink to="./MarkAsNotSuitRecord">标记不合适记录</RouterLink>
        <RouterLink to="./JobLibrary">职位库</RouterLink>
        <RouterLink to="./BossLibrary">Boss库</RouterLink>
        <RouterLink to="./CompanyLibrary">公司库</RouterLink>
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
    <RouterView v-slot="{ Component }" class="flex-1 of-hidden">
      <KeepAlive>
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { TopRight, QuestionFilled } from '@element-plus/icons-vue'
import useBuildInfo from '@renderer/hooks/useBuildInfo'
import { debounce } from 'lodash'
import { gtagRenderer } from '@renderer/utils/gtag'
import { useUpdateStore, useTaskManagerStore } from '../../store/index'

const router = useRouter()
const unmountedCbs: Array<InstanceType<typeof Function>> = []
onUnmounted(() => {
  while (unmountedCbs.length) {
    const fn = unmountedCbs.shift()!
    try {
      fn()
    } catch {}
  }
})
;(async () => {
  const checkDependenciesResult = await electron.ipcRenderer.invoke('check-dependencies')
  if (Object.values(checkDependenciesResult).includes(false)) {
    router.replace('/')
    return
  }
})()

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
</script>

<style lang="scss" scoped>
.aside-nav {
  background-image: linear-gradient(45deg, #eaf4f1, #dcf6f2);
  .nav-list {
    > a {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 2.5em;
      box-sizing: border-box;
      padding-left: 2em;
      &.router-link-active {
        background-color: #fff;
        font-weight: 700;
        color: #2faa9e;
        border-radius: 9999px 0 0 9999px;
      }
    }
    > hr {
      border: 0 solid;
      height: 1px;
      background-color: #b3c8c3;
      margin-top: 0;
      margin-bottom: 0;
      margin-right: 0;
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
</style>
