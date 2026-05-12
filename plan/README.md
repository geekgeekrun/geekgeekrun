# plan/ 文档索引

本目录存放招聘端（BOSS）相关的设计、流程说明与阶段性记录。单篇篇幅较长时，**先读本索引再点进对应文件**。

---

## 从这里开始

| 文档 | 说明 |
|------|------|
| [recruiter_architecture.md](recruiter_architecture.md) | **招聘端架构总览**：UI / IPC / Worker、`boss-auto-browse-and-chat` 模块分工、主循环要点。协作开发时优先读这篇。 |
| [recruiter_chat_page_hr_guide.md](recruiter_chat_page_hr_guide.md) | **给 HR 的操作说明**：登录、职位筛选、LLM、沟通页启动；非开发者入口。 |

---

## 架构与页面结构

| 文档 | 说明 |
|------|------|
| [boss_auto_browse_tabs.md](boss_auto_browse_tabs.md) | 自动化里「沟通 Tab + 推荐牛人 Tab」双 Tab 设计、URL、主流程顺序。 |
| [chat_page_tab_navigation.md](chat_page_tab_navigation.md) | 沟通页左侧「会话类型 Tab」与「已读/未读」两套控件、导航顺序与实现注意点。 |
| [recommend_page_flow.md](recommend_page_flow.md) | 推荐牛人页完整逻辑：iframe 结构、选择器、各 `.mjs` 分工。 |

---

## 沟通页 · 简历与筛选

| 文档 | 说明 |
|------|------|
| [chat_page_resume_flow.md](chat_page_resume_flow.md) | 在线简历 → 关键词/LLM → 附件简历 → PDF 的流程与数据链路说明。 |
| [cv_canvas_solution.md](cv_canvas_solution.md) | 在线简历 Canvas/WASM 加密与提取思路（fillText Hook、`get_export_geek_detail_info` 等）。 |
| [recruiter_llm_integration.md](recruiter_llm_integration.md) | 招聘端 LLM：`boss-llm.json`、多用途模型、Rubric、与实现状态。 |
| [recruiter_debug_tool.md](recruiter_debug_tool.md) | 招聘端调试工具：进程架构、IPC、与正式流程一致的操作栈。 |

---

## 集成与扩展规划

| 文档 | 说明 |
|------|------|
| [webhook_integration.md](webhook_integration.md) | Webhook：配置、Payload、相关源码路径、与任务结束时的发送时机。 |
| [multi-job-switching.md](multi-job_switching.md) | 多职位同步、`boss-jobs-config.json`、按职位配置与顺序执行的设计草案。 |

---

## 工程细节

| 文档 | 说明 |
|------|------|
| [logger_usage.md](logger_usage.md) | `logger.mjs` 级别、API、`boss-recruiter.json` 中 `logLevel` 的用法。 |
| [recruiter_mouse_trajectory.md](recruiter_mouse_trajectory.md) | 拟人鼠标（ghost-cursor 等）要求与适用范围。 |

---

## 状态与里程碑（可能部分重叠）

| 文档 | 说明 |
|------|------|
| [current_status_2026_03_18.md](current_status_2026_03_18.md) | 截至 2026-03-18：已实现能力、已知问题（尤其推荐页状态/去重）、下一步计划。 |
| [STATUS_2026-03-18.md](STATUS_2026-03-18.md) | 同日另一份阶段性现状（沟通可用、推荐页状态判定待加强等），可与上一篇对照阅读。 |

---

## 历史方案与并行开发稿（篇幅大、偏「当时怎么拆任务」）

以下文件多为早期规划或已 resolve 的长文，**需要考古或对齐旧 Prompt 时再打开**。

| 文档 | 说明 |
|------|------|
| [implementation_plan.md.resolved](implementation_plan.md.resolved) | 招聘端功能扩展总体方案（可行性、Phase、工时等）。 |
| [parallel_execution_plan.md.resolved](parallel_execution_plan.md.resolved) | 分 Phase 并行执行的 Agent Prompt 集合；文中引用 `recruiter_mouse_trajectory.md`。 |

> 说明：`.gitignore` 中忽略了 `*.resolved` 等类型；若仓库中未跟踪这些文件，以你本地是否存在为准。

---

## 未列入索引的文件

| 类型 | 说明 |
|------|------|
| `log.txt` / `log_recommend.txt` | 运行日志样例，非设计文档。 |
| `.gitignore` | 忽略规则。 |

---

*索引维护：新增或拆分大文档时，请在本 README 中补一行条目，避免目录再次难以浏览。*
