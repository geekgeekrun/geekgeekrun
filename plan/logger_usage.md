# 招聘端 logger 用法说明

> **定位**：`packages/boss-auto-browse-and-chat/logger.mjs` 的 API、配置与使用约定。  
> 最后更新：2026-03-18

---

## 1. 用途与级别

- **用途**：招聘端推荐页、沟通页的统一日志输出，支持按级别过滤，避免生产环境刷屏。
- **级别**（由低到高）：`debug` < `info` < `warn` < `error`。  
  设置某一级别后，只会输出 **大于等于** 该级别的日志（例如设为 `info` 时，会输出 info / warn / error，不输出 debug）。

---

## 2. API

| 接口 | 说明 |
|------|------|
| `setLevel(level)` | 设置当前最低输出级别。`level` 为 `'debug'` / `'info'` / `'warn'` / `'error'`；非法值会回退为 `'info'`。 |
| `getLevel()` | 返回当前级别对应的数字（debug=0, info=1, warn=2, error=3）。 |
| `debug(...args)` | 输出 debug 级日志，底层使用 `console.log`。 |
| `info(...args)` | 输出 info 级日志，底层使用 `console.log`。 |
| `warn(...args)` | 输出 warn 级日志，底层使用 `console.warn`。 |
| `error(...args)` | 输出 error 级日志，底层使用 `console.error`。 |

`debug` / `info` / `warn` / `error` 的调用方式与 `console.log` 一致，支持多参数和字符串替换。

---

## 3. 配置来源与谁调 setLevel

- **配置项**：`config.logLevel`（来自 `~/.geekgeekrun/config/boss-recruiter.json` 或流程传入的 config 对象）。
- **调用时机**：由主流程在**读取 config 之后**调用一次 `setLevel`，后续所有模块共享同一级别。
- **实际调用位置**：
  - **推荐牛人**：`index.mjs` 在启动时读取 `boss-recruiter.json`，调用 `setLevel((readConfigFile('boss-recruiter.json') || {}).logLevel || 'info')`；配置热更新时再次 `setLevel(config?.logLevel || 'info')`。
  - **沟通页**：`chat-page-processor.mjs` 启动时根据传入的 `config` 调用 `setLevel(config.logLevel || 'info')`。
- **默认级别**：未配置或配置缺失时为 `'info'`。

---

## 4. 在业务模块中的使用方式

在 `boss-auto-browse-and-chat` 包内任意模块中：

```javascript
import { debug as logDebug, info as logInfo, warn as logWarn, error as logError } from './logger.mjs'

// 按需使用，语义与级别一致
logDebug('详细调试信息', someObject)
logInfo('正常流程提示')
logWarn('可恢复的异常或边界情况')
logError('错误信息', err)
```

约定：业务模块**只使用** `debug` / `info` / `warn` / `error`，**不调用** `setLevel`；`setLevel` 仅由 `index.mjs` 与 `chat-page-processor.mjs` 在读取 config 后调用。

---

## 5. 配置文件示例

在 `boss-recruiter.json` 中可选增加：

```json
{
  "logLevel": "debug"
}
```

合法值为 `"debug"` | `"info"` | `"warn"` | `"error"`。开发时可设为 `"debug"`，生产环境建议 `"info"` 或 `"warn"`。
