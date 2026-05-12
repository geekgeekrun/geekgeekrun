# BOSS 直聘在线简历 Canvas/WASM 反爬机制分析与破解方案

## 一、机制概述

BOSS 直聘的「在线简历」页面采用了一套基于 WebAssembly 的反爬方案，核心目的是防止简历内容被直接抓取：

- 简历数据以**加密字符串**形式下发（Base64 + AES-256 加密）
- 解密过程完全在 **WASM 沙箱内**完成，JS 层无法直接访问明文
- 解密后的明文**逐字绘制到 Canvas**，用户看到的是像素而非 DOM 文本
- Canvas 内容无法被 `innerText`、`querySelector` 等常规手段提取

## 二、技术栈与文件

| 文件 | 作用 |
|------|------|
| `wasm_canvas_bg-1.0.2-5057.wasm` | 核心 WASM 二进制，含解密+渲染逻辑 |
| `wasm_canvas_bg-1.0.2-5057.dcmp` | 上述 WASM 的反编译结果（~23万行） |
| `wasm_canvas-1.0.2-5057.js` | wasm-bindgen 生成的 JS 胶水层 |
| `index-Ue9MaX2q.js` | 页面业务逻辑，负责初始化 WASM 并调用 `start()` |

加载链路：
```
zhipin.com 主页面
  → postMessage → iframe (c-resume)
    → index-Ue9MaX2q.js: initWasm() → __wbg_init()
    → 加载 wasm_canvas_bg-*.wasm
    → start(container, content, geek_info_encrypt_string, ...)
    → WASM 内部解密 → 逐字 fillText 到 Canvas
```

## 三、WASM 内部解密流程

基于对反编译文件的分析：

### 加密方案
- **Base64** 编码 + **AES-256** 加密 + **PKCS#7** 填充
- AES 实现：aes-0.8.4 crate（pure Rust，fixslice32 实现）
- AES 模式：**未确认**（CBC/CTR/GCM 均未在反编译文件中出现，CBC 是推断）
- 密钥和 IV 打散在 WASM 二进制中，未恢复

### 关键函数（反编译行号）

| 函数 | 编号 | 行号 | 作用 |
|------|------|------|------|
| `start()` | func452 | 122298 | JS 入口，接收加密字符串 |
| `start_anonymous_resume()` | func453 | 122369 | 匿名简历入口 |
| `f_qg()` | func198 | 50684 | 核心编排：Base64解码 + AES解密 |
| `f_hi()` | func241 | 94273 | 文本渲染循环 |
| `fillText` 调用点 | — | 94814 | 唯一的 fillText 调用 |
| `get_export_geek_detail_info()` | func4040 | 228899 | 导出解密后的结构化数据 |

### 调用链
```
start() [L122298]
  ↓
f_qg() [L50684]  — Base64解码 → AES解密 → PKCS#7去填充
  ↓
f_hi() [L94273]  — 遍历文本元素
  ↓
wasm_canvas_bg_js_wbg_fillText_4a931850b976cc62(ctx, ptr, len, x, y)  [L94814]
  ↓
JS: getObject(ctx).fillText(getStringFromWasm0(ptr, len), x, y)
  ↓
Canvas 像素渲染
```

### fillText JS 胶水层（wasm_canvas-1.0.2-5057.js L344-346）
```js
__wbg_fillText_4a931850b976cc62: function(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).fillText(getStringFromWasm0(arg1, arg2), arg3, arg4);
}
```
- `arg1`（ptr）+ `arg2`（len）：WASM 线性内存中的 UTF-8 字符串
- `getStringFromWasm0` 通过 `TextDecoder` 将其转为 JS 字符串
- **此处是明文暴露的最后一关**

### 关于 get_export_geek_detail_info
```js
// wasm_canvas-1.0.2-5057.js L46-48
export function get_export_geek_detail_info() {
    const ret = wasm.get_export_geek_detail_info();
    return takeObject(ret);  // 返回 JS 对象，不是裸指针
}
```
- 返回值是 wasm-bindgen JS heap 对象，包含结构化简历数据
- 需通过模块导出的 wrapper 调用，不能直接访问 `wasm.*`
- 调用时机：`start()` 返回后

## 四、渲染特征

- 每个字符**单独调用一次 fillText**（逐字渲染，非逐行）
- 同一字符会被**绘制两次**（两个叠加 Canvas，高清/普通各一层）
- 坐标系：x 为横向像素位置，y 为行基线位置（相同 y 值 = 同一行）

## 五、已验证的破解方案

### 方案一：Hook CanvasRenderingContext2D.prototype.fillText（推荐）

**原理**：在 fillText 原型上插桩，收集所有绘制调用的文本和坐标。

**难点**：简历渲染在 iframe 内，且每次打开都是新 iframe 实例，需在 iframe 创建时立即注入。

**验证结果**：✅ 已成功提取完整简历明文

**检测风险**：直接替换 prototype 方法后，`fillText.toString()` 会暴露自定义函数体而非 `[native code]`，可被检测。使用 Proxy 方案可规避此问题。

**注入代码（Proxy 版，toString 保持 [native code]）**：
```js
// 在主页面 Console 执行，然后再打开简历
window._collected = [];

const observer = new MutationObserver(() => {
    const iframe = document.querySelector('iframe[src*="c-resume"]');
    if (iframe && !iframe._hooked) {
        iframe._hooked = true;
        iframe.addEventListener('load', () => {
            const iwin = iframe.contentWindow;
            if (!iwin) return;
            const orig = iwin.CanvasRenderingContext2D.prototype.fillText;
            Object.defineProperty(iwin.CanvasRenderingContext2D.prototype, 'fillText', {
                value: new Proxy(orig, {
                    apply(target, thisArg, args) {
                        const [text, x, y] = args;
                        if (text && text.trim()) window._collected.push({ text, x, y });
                        return Reflect.apply(target, thisArg, args);
                    }
                }),
                writable: true,
                configurable: true,
            });
            console.log('✓ hook 注入到新 iframe');
        });
    }
});
observer.observe(document.body, { childList: true, subtree: true });
```

**后处理（去重+按行合并）**：
```js
const lines = {};
window._collected.forEach(({text, x, y}) => {
    const row = Math.round(y);
    if (!lines[row]) lines[row] = [];
    lines[row].push({text, x});
});

const result = Object.keys(lines)
    .map(Number)
    .sort((a, b) => a - b)
    .map(y => {
        const sorted = lines[y].sort((a, b) => a.x - b.x);
        // 去重：相同 x 位置（双层 Canvas 导致每字画两次）
        const deduped = sorted.filter((item, i) =>
            i === 0 || Math.abs(item.x - sorted[i-1].x) > 1
        );
        return deduped.map(c => c.text).join('');
    })
    .join('\n');

console.log(result);
```

### 方案二：调用 get_export_geek_detail_info()（待验证）

**原理**：`start()` 完成后，调用官方导出函数直接获取结构化 JS 对象。

**优点**：数据结构化，包含字段语义（姓名、学历、工作经历等）

**待验证**：
- WASM 模块实例在 `index-Ue9MaX2q.js` 中如何暴露
- `start()` 返回后立即可调用，还是需要等某个回调
- 返回对象的字段结构

### 方案三：Hook WASM JS import（备选）

```js
// 在 iframe load 后，替换 WASM import 对象中的 fillText 绑定
// 比 prototype hook 更底层，但需要在 __wbg_init 之前注入
```

## 六、不推荐的方案

| 方案 | 原因 |
|------|------|
| OCR 识别 Canvas | 精度差，中文易误识别，成本高 |
| 恢复 AES key/IV | 密钥打散在二进制中，工程量大，版本升级即失效 |
| 修改 WASM 二进制插入 early return | 可行但维护成本极高，版本升级即失效 |
| DOM 文本提取 | 简历内容不在 DOM 中，无效 |

## 七、稳定性与风险

- fillText hook 方案**不依赖** WASM 内部实现，版本升级只要渲染方式不变就依然有效
- BOSS 直聘最后一页附有版权声明（见提取结果末尾），提醒数据仅限招聘目的使用
- 如 BOSS 直聘升级为 OffscreenCanvas 或 Worker 渲染，prototype hook 会失效，需改为 hook Worker 内的 Canvas API
