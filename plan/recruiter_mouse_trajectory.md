# 招聘端拟人鼠标轨迹（反人机）

## 一、原作者提醒（必须重视）

> **鼠标轨迹**：BOSS 会对招聘端**鼠标移动轨迹**进行埋点，这个可能是判断人机的特征之一。可以试试看能不能借助一些库生成**拟人的鼠标轨迹**。

含义：招聘端所有在页面上发生的**点击、移动**，若以「瞬移」方式执行（如直接 `element.click()` 或 `page.mouse.click(x, y)`），容易被埋点识别为脚本。**各 Phase 中凡涉及浏览器内点击/移动的操作，都应使用拟人轨迹**，而不能忽略此问题。

---

## 二、适用范围（各 Phase）

| Phase | 是否涉及页面点击/移动 | 说明 |
|-------|----------------------|------|
| **Phase 0** | 否（仅脚手架与入口） | 无浏览器操作，可不考虑。 |
| **Phase 1** | **是** | 1B 导航、Cookie；1C 若在 page 上操作。凡在招聘端页面上的 click/move 都需拟人。 |
| **Phase 2** | **是** | 2A 列表解析可能有点击/滚动；2B 开聊、点击按钮、输入框。必须拟人。 |
| **Phase 3** | **是** | 3A 主流程串联，所有点击/滚动/输入均需拟人。 |
| **Phase 4** | **是** | 4A/4B/4C 若有页面交互，同样需拟人。 |

**原则**：只要代码在**招聘端 BOSS 页面**上执行 `page.click`、`page.mouse.click`、`element.click()`、或先 `page.mouse.move` 再点击，都应改为「沿拟人轨迹移动 + 再点击」，而不是坐标瞬移。

---

## 三、推荐实现方式：拟人轨迹库

### 3.1 库选型

- **ghost-cursor**（推荐）  
  - npm: `ghost-cursor`  
  - 用途：用贝塞尔曲线生成两点间拟人移动路径，支持 Puppeteer；可 overshoot 再回弹、按距离/元素大小调速。  
  - 用法：对 `page` 创建 `GhostCursor`，用 `cursor.move(selector)` / `cursor.click(selector)` 替代直接 `page.click(selector)`。

- **@extra/humanize**（puppeteer-extra 插件）  
  - npm: `@extra/humanize`  
  - 用途：基于 ghost-cursor 的贝塞尔技术，对 puppeteer-extra 的 `page.click()` 等做拟人增强，与现有 stealth 等插件可叠加使用。

### 3.2 集成思路

1. **招聘端专用封装**  
   在 `packages/boss-auto-browse-and-chat/` 下提供统一入口，例如：
   - `humanMouse.mjs`：封装 `createHumanCursor(page)`，返回的 cursor 提供 `move(selector|{x,y})`、`click(selector|{x,y})`，内部用 ghost-cursor（或 @extra/humanize）沿轨迹移动再点击。
2. **替换所有「裸」点击**  
   - 凡在招聘端页面上的点击/移动，不直接调用 `page.click()`、`page.mouse.click(x,y)`、`element.click()`，改为通过上述封装执行（先沿轨迹移动再点击）。
3. **Phase 1～4 的 Agent 实现约束**  
   - 在 parallel_execution_plan 中已注明：涉及页面操作的 Phase，实现时**必须**使用拟人鼠标（本 plan），避免遗漏。

### 3.3 示例（ghost-cursor）

```js
import { createCursor } from 'ghost-cursor';

// 在 page 创建后
const cursor = createCursor(page);

// 替代 page.click(selector)
await cursor.click(selector);

// 或先移动到坐标再点击
await cursor.move({ x: 100, y: 200 });
await cursor.click();
```

若使用 **puppeteer-extra**，可挂载 **@extra/humanize** 插件，让所有 `page.click()` 自动带拟人移动（需确认与当前 puppeteer-extra 版本兼容）。

---

## 四、与 plan 的对应关系

- **简历 Canvas 破解**：见 **plan/cv_canvas_solution.md**（Claude Code 已实现并验证）。
- **招聘端流程与 Phase 划分**：见 **plan/parallel_execution_plan.md.resolved**；各 Phase 中涉及页面操作的，均需遵守本拟人鼠标方案。
- **沟通页简历流程**：见 **plan/chat_page_resume_flow.md**；其中在沟通页内的点击（如打开在线简历、求简历、下载 PDF）也需拟人轨迹。

---

*文档维护：招聘端任何新增的页面点击/移动，都应默认使用拟人轨迹并在此 doc 或实现处注明。*
