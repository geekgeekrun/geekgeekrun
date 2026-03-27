// 招聘端 CSS 选择器常量（参考 packages/geek-auto-start-chat-with-boss/constant.mjs 风格）
// 结构参考：examples/BOSS直聘-推荐牛人.html、推荐牛人-候选人详情页、推荐牛人-打招呼、推荐牛人-继续沟通
// 沟通页参考：examples/BOSS直聘-沟通-聊天框.html、BOSS直聘-沟通-附件简历.html

// =============================================================================
// 一、推荐牛人页（/web/boss/recommend）— 主动打招呼流程
// =============================================================================
// 流程：点"打招呼"→ 招呼自动发送 → 弹窗"已向牛人发送招呼"→ 点"知道了"→ 点该条"继续沟通"→ 在 #boss-chat-global-input 输入并回车发送（无发送按钮）
//
// 1. CANDIDATE_LIST_SELECTOR：列表容器
// 2. CANDIDATE_ITEM_SELECTOR：单条候选人（li）
// 3. CANDIDATE_NAME_SELECTOR：在 item 内姓名
// 4. CANDIDATE_DETAIL_SELECTOR：无独立详情面板，留空
// 5. CHAT_START_BUTTON_SELECTOR：打招呼按钮（在 item 内）
// 6. 弹窗"知道了"、继续沟通、聊天输入框见下方

/** 1. 候选人列表容器（在 iframe[name="recommendFrame"] 内） */
export const CANDIDATE_LIST_SELECTOR = 'ul.card-list'

/** 2. 单个候选人条目（取多个用 querySelectorAll，在 iframe 内） */
export const CANDIDATE_ITEM_SELECTOR = 'ul.card-list > li.card-item'

/** 3. 候选人姓名（在单条 item 内：item.querySelector(CANDIDATE_NAME_SELECTOR)） */
export const CANDIDATE_NAME_SELECTOR = 'span.name'

/** 4. 详情面板（推荐牛人页无独立详情面板，留空） */
export const CANDIDATE_DETAIL_SELECTOR = ''

/** 5. 打招呼按钮（在单条 item 的 div.operate-side 内） */
export const CHAT_START_BUTTON_SELECTOR = 'button.btn-greet'

/** "已向牛人发送招呼"弹窗内的"知道了"按钮（弹窗在主页面，不在 iframe 内） */
export const GREETING_SENT_KNOW_BTN_SELECTOR = 'div.dialog-wrap button.btn-sure-v2'

/** 继续沟通按钮（在单条 item 内；点完"知道了"后再点此项） */
export const CONTINUE_CHAT_BUTTON_SELECTOR = 'div.operate-side div.button-chat'

/** 聊天输入框（点"继续沟通"后出现，无发送按钮，用回车发送） */
export const CHAT_INPUT_SELECTOR = '#boss-chat-global-input'

/** 列表/分页：下一页按钮（多种样式兼容） */
export const NEXT_PAGE_BUTTON_SELECTOR = '.options-pages a.next, .pagination .next, [ka*="next"], [class*="next-page"]'

/** 推荐页：单条候选人卡片内的"不感兴趣"区域（点击后弹出原因选择，需再选原因才关闭） */
export const NOT_INTERESTED_IN_ITEM_SELECTOR = 'div.tooltip-wrap.suitable'

/** 推荐页（iframe 内）：点击"不感兴趣"后弹出的原因选择弹窗（选择不喜欢的原因，为您优化推荐） */
export const NOT_INTERESTED_REASON_POPUP_SELECTOR = 'div.card-reason-f1.show'

/** 推荐页：原因弹窗内所有可选项（span.first-reason-item），按筛选原因选对应一项以优化推荐 */
export const NOT_INTERESTED_REASON_ITEMS_SELECTOR = 'div.card-reason-f1.show span.first-reason-item'

/** 筛选原因 → 弹窗选项文案（精确匹配）。与 candidate-processor 的 reason 一致，便于 BOSS 优化推荐；后续可接 LLM 根据 reasonDetail 选更贴切项 */
export const NOT_INTERESTED_REASON_MAP = {
  city: '牛人距离远',
  education: '不考虑本科',
  salary: '期望薪资偏高',
  workExp: '工作经历和制剂研发无关',
  viewed: '重复推荐',
  skills: '其他原因',
  blockName: '其他原因'
}

/** 弹窗中用于"与职位不符"的选项匹配：若选项文案包含此字符串则视为职位/技能不符（skills、blockName 可优先选此项） */
export const NOT_INTERESTED_REASON_POSITION_MISMATCH = '与职位不符'

/** 无匹配或未知原因时使用的弹窗选项 */
export const NOT_INTERESTED_REASON_FALLBACK = '其他原因'

/** 原因弹窗的关闭图标（未匹配到原因时点击以关闭弹窗，避免卡住后续操作） */
export const NOT_INTERESTED_REASON_POPUP_CLOSE_SELECTOR = 'div.card-reason-f1.show div.close-icon'

/** 推荐页：简历详情弹窗的关闭按钮（主页面，非 iframe 内） */
export const RESUME_POPUP_CLOSE_SELECTOR = 'div.boss-popup__close'

/** @deprecated 招呼为自动发送，无需弹窗输入框；若需在弹窗内编辑招呼语可再用 */
export const GREETING_DIALOG_SELECTOR = 'body > div.dialog-wrap.dialog-chat-greeting.v-transfer-dom > div.dialog-container'

/** @deprecated 招呼自动发送，留空；发后续消息用 CHAT_INPUT_SELECTOR + Enter */
export const GREETING_INPUT_SELECTOR = ''

// 招聘端 URL 常量
/** 推荐牛人页（招聘端入口可能是 /web/boss/recommend 或 /web/chat/recommend，需与当前站点一致） */
export const BOSS_RECOMMEND_PAGE_URL = 'https://www.zhipin.com/web/chat/recommend'
/** 沟通页（默认入口，登录后可能落在此页，需点击"推荐牛人"切到推荐页） */
export const BOSS_CHAT_INDEX_URL = 'https://www.zhipin.com/web/chat/index'
/** 沟通页 URL 别名（/web/boss/chat） */
export const BOSS_CHAT_PAGE_URL = 'https://www.zhipin.com/web/chat/index'

/** 侧栏"推荐牛人"入口（在沟通页时点击可切到推荐牛人页） */
export const RECOMMEND_MENU_BUTTON_SELECTOR = '#wrap > div.side-wrap.side-wrap-v2 > div > dl.menu-recommend > dt > a'

/** 推荐页：顶部职位下拉触发按钮（主页面 #headerWrap 内，点击后展开职位列表） */
export const RECOMMEND_JOB_DROPDOWN_LABEL_SELECTOR = '#headerWrap .ui-dropmenu-label'
/** 推荐页：职位下拉列表容器 */
export const RECOMMEND_JOB_LIST_SELECTOR = '#headerWrap ul.job-list'
/** 推荐页：职位下拉内单条职位项（li.job-item，value 为 jobId，文本为职位名） */
export const RECOMMEND_JOB_ITEM_SELECTOR = '#headerWrap ul.job-list li.job-item'

/** 沟通页：顶部职位筛选下拉触发按钮（点击展开职位列表） */
export const CHAT_PAGE_JOB_DROPDOWN_SELECTOR = '.chat-top-job .ui-dropmenu-label'
/** 沟通页：职位下拉展开后的列表项（过滤 value="-1" 的"全部职位"） */
export const CHAT_PAGE_JOB_ITEM_SELECTOR = '.chat-top-job .ui-dropmenu-list li'

// =============================================================================
// 二、沟通页（/web/chat/index）— 会话列表、要简历、预览附件、下载 PDF
// =============================================================================
// 流程简述：
// - 看在线简历：无需对方同意，点"查看在线简历"即可，内容在 #resume（Canvas），用 resume-extractor 提字 → 关键词/LLM 筛选。
// - 下载 PDF：需先"请求附件简历"→ 等对方同意（异步）→ 对方同意后 PDF 会作为新消息发到聊天里 → 再点该消息里的"点击预览附件简历"→ 在弹窗中点"下载 PDF"。
// 沟通页每条是什么：
// - CHAT_PAGE_USER_LIST_SELECTOR：左侧整块会话列表的容器（装所有"金琳枝 研究员"这类一行一行的 div）
// - CHAT_PAGE_ITEM_SELECTOR：左侧"每一个会话"那一行（在列表容器内取多个）
// - CHAT_PAGE_NAME_SELECTOR / CHAT_PAGE_JOB_SELECTOR：该行里的姓名、职位
// - CHAT_PAGE_ONLINE_RESUME_SELECTOR：右侧"查看在线简历"的图标/链接（无需对方同意）
// - CHAT_PAGE_ATTACH_RESUME_BTN_SELECTOR：右侧"附件简历"按钮，点它会出"确定向牛人索取简历吗"
// - CHAT_PAGE_ASK_RESUME_CONFIRM_BTN_SELECTOR：索取简历确认弹窗里的"确认"按钮
// - CHAT_PAGE_MESSAGE_ITEM_SELECTOR：右侧聊天区域里"每一条消息"的容器
// - CHAT_PAGE_PREVIEW_RESUME_BTN_SELECTOR：消息里"点击预览附件简历"（对方同意并发来 PDF 后，新消息里会出现）
// - CHAT_PAGE_DOWNLOAD_PDF_BTN_SELECTOR：简历预览弹窗里的"下载 PDF"按钮

/** 沟通页：顶部"全部"筛选 tab（span:nth-child(1) 在 .chat-message-filter-left 内） */
export const CHAT_PAGE_ALL_FILTER_SELECTOR = '.chat-message-filter-left span:nth-child(1)'

/** 沟通页：顶部"未读"筛选 tab（span:nth-child(2) 在 .chat-message-filter-left 内，active 时有 class="active"） */
export const CHAT_PAGE_UNREAD_FILTER_SELECTOR = '.chat-message-filter-left span:nth-child(2)'

/** 左侧会话列表容器 */
export const CHAT_PAGE_USER_LIST_SELECTOR = '.user-container'

/** 左侧单个会话 item（.geek-item，id=_<geekId>-0，data-id=<geekId>-0） */
export const CHAT_PAGE_ITEM_SELECTOR = '.user-container .geek-item'

/** 沟通页会话项内：候选人姓名 */
export const CHAT_PAGE_NAME_SELECTOR = 'span.geek-name'

/** 沟通页会话项内：职位 */
export const CHAT_PAGE_JOB_SELECTOR = 'span.source-job'

/** 沟通页左侧会话项：未读消息数角标（缺席则无未读） */
export const CHAT_PAGE_ITEM_UNREAD_SELECTOR = 'span.badge-count'

/** 沟通页右侧面板：当前会话候选人姓名（用于验证会话是否切换成功） */
export const CHAT_PAGE_ACTIVE_NAME_SELECTOR = '.name-contet .name-box'

/** 沟通页右侧：查看在线简历按钮（a.resume-btn-online，无 href，Vue 点击事件） */
export const CHAT_PAGE_ONLINE_RESUME_SELECTOR = 'a.resume-btn-online'

/**
 * 沟通页：在线简历点开后，简历内容的容器选择器（#resume）。
 * 完整版简历：加密数据 → WASM 解密（decrypt.rs）→ 仅在此容器内 Canvas 绘制，与 geek/info 的简单摘要不是同一份数据；详见 plan/chat_page_resume_flow.md。
 */
export const CHAT_PAGE_ONLINE_RESUME_CONTENT_SELECTOR = '#resume'

/**
 * 沟通页：在线简历 iframe 选择器（点击"查看在线简历"后动态插入，#resume Canvas 在此 iframe 内部）。
 * 用于等待在线简历已打开，不能用 #resume（在 iframe 内部，主页面 waitForSelector 找不到）。
 */
export const CHAT_PAGE_ONLINE_RESUME_IFRAME_SELECTOR = 'iframe[src*="c-resume"]'

/** 沟通页：在线简历弹窗的关闭按钮（切换候选人时需先关闭旧弹窗再打开新的） */
export const CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR = '.resume-common-dialog .boss-popup__close'

/** 沟通页右侧：附件简历按钮（点击后出现"确定向牛人索取简历吗"；disabled 时也可点击触发确认弹窗） */
export const CHAT_PAGE_ATTACH_RESUME_BTN_SELECTOR = 'div.resume-btn-content .resume-btn-file'

/**
 * 沟通页：索取简历确认弹窗内的确认按钮。
 * 弹窗由 Vue v-if 控制（未点击附件简历时不在 DOM 中，点击后才插入）。
 * HTML: div.ask-for-resume-confirm > div.content > button.boss-btn-primary
 */
export const CHAT_PAGE_ASK_RESUME_CONFIRM_BTN_SELECTOR = 'div.ask-for-resume-confirm > div.content > button.boss-btn-primary'

/** 沟通页：每条聊天消息的容器（.message-item，在 .chat-message-list 下） */
export const CHAT_PAGE_MESSAGE_ITEM_SELECTOR = '.chat-message-list .message-item'

/**
 * 沟通页：消息里的"点击预览附件简历"按钮。
 * 用 :only-child 限定：预览按钮是 message-card-buttons 内的唯一子元素，
 * 而"拒绝/同意"场景有两个 span.card-btn，不会被误匹配。
 */
export const CHAT_PAGE_PREVIEW_RESUME_BTN_SELECTOR = 'div.message-card-buttons > span.card-btn:only-child'

/**
 * 沟通页：候选人主动发来附件简历时，BOSS 显示"对方想发送附件简历给您，您是否同意"，
 * 其中"同意"按钮有 d-c 属性（Vue click handler），"拒绝"没有。
 * 用 :not(.disabled) 过滤已点击过的状态。
 * HTML: <span d-c="61031" class="card-btn">同意</span>
 */
export const CHAT_PAGE_ACCEPT_ATTACH_RESUME_BTN_SELECTOR = 'div.message-card-buttons > span[d-c].card-btn:not(.disabled)'

/**
 * 沟通页：简历预览弹窗内下载 PDF 按钮（.popover 容器，点击后触发下载）。
 * 三个按钮顺序为：全屏、打印、下载（#icon-attacthment-download）。
 * 用 :nth-child(3) 定位下载按钮的 .popover 容器（比定位 SVG use 更易点击）。
 * HTML: .resume-common-dialog .attachment-resume-btns > .popover:nth-child(3)
 */
export const CHAT_PAGE_DOWNLOAD_PDF_BTN_SELECTOR = '.resume-common-dialog .attachment-resume-btns > .popover:nth-child(3)'

/** 沟通页：附件简历预览弹窗的关闭按钮（.resume-common-dialog > .boss-popup__close） */
export const CHAT_PAGE_ATTACH_RESUME_DIALOG_CLOSE_SELECTOR = '.resume-common-dialog .boss-popup__close'

/**
 * 沟通页：切换到新会话时 BOSS 弹出的「意向沟通」提示弹窗（"您可以在这里直接对牛人发起「意向沟通」"）。
 * 浏览器每次重新启动，BOSS 将其当作新用户会弹出此提示，遮挡右侧面板的操作按钮（附件简历等）。
 * 弹窗位于 .op-btn.rightbar-item 内，HTML: div.dialog-container > div.dialog-body > div.content > div.button > span（"我知道了"）
 * 用 .op-btn.rightbar-item 缩小范围，避免与其他 dialog-container 冲突。
 */
export const CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR = '.op-btn.rightbar-item div.dialog-container div.button span'

/** 沟通页：「意向沟通」弹窗的关闭图标（备用，点任一即可） */
export const CHAT_PAGE_INTENT_DIALOG_CLOSE_SELECTOR = '.op-btn.rightbar-item div.dialog-container div.iboss-close.close'

/**
 * 沟通页：左侧会话列表上方的分类 tab（全部 / 沟通中 / 已获取简历 / 已交换微信 等）。
 * 若误触到「已交换微信」等空分组会显示「暂无牛人」。用此选择器切回「全部」恢复列表。
 * HTML: div.chat-label-item[title="全部"]，选中态有 class selected。
 */
export const CHAT_PAGE_TAB_ALL_SELECTOR = '.chat-label-item[title="全部"]'

// =============================================================================
// 三、治理公告弹窗（登录后出现，须点击「我已知晓」才能继续操作）
// =============================================================================
/**
 * 治理公告弹窗（dialog-uninstall-extension）容器选择器。
 * BOSS 每次登录后会弹出此公告，告知平台禁止使用第三方自动化工具。
 * HTML: div.boss-popup__wrapper.boss-dialog.boss-dialog__wrapper.dialog-uninstall-extension
 */
export const GOVERNANCE_NOTICE_DIALOG_SELECTOR = '.dialog-uninstall-extension'

/**
 * 治理公告弹窗内的「我已知晓」确认按钮（div.confirm-btn，背景图模拟按钮样式）。
 * HTML: div.dialog-uninstall-extension div.uninstall-extension div.content div.confirm-btn
 */
export const GOVERNANCE_NOTICE_DIALOG_CONFIRM_BTN_SELECTOR = '.dialog-uninstall-extension .confirm-btn'

/**
 * 沟通页：左侧会话列表分类 tab——「新招呼」（候选人主动发来招呼的会话）。
 * 每次开始处理前须先点击此 tab，确保只扫描新招呼消息，避免遍历其他类型会话。
 * HTML: div.chat-label-item[title="新招呼"]，选中态有 class selected。
 */
export const CHAT_PAGE_TAB_NEW_GREET_SELECTOR = '.chat-label-item[title="新招呼"]'
