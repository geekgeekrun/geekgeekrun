<template>
  <div class="group-item">
    <div class="group-title">逛BOSS</div>
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
</template>

<script lang="ts" setup>
import { gtagRenderer } from '@renderer/utils/gtag'
import { debounce } from 'lodash'
import { ElMessage } from 'element-plus'
import { TopRight, QuestionFilled } from '@element-plus/icons-vue'

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
</script>

<style scoped lang="scss" src="./style.scss"></style>
