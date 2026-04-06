"use strict";

const { PuppeteerExtraPlugin } = require("puppeteer-extra-plugin");

// 定义脚本内容，避免重复定义
const stealthScript = () => {
  "use strict";
  /* -------------------------------------------------------
   * 1. 保存原生 Function.prototype.toString
   * ----------------------------------------------------- */
  const nativeFunctionToString = Function.prototype.toString;

  /* -------------------------------------------------------
   * 2. WeakMap：函数 → 伪原生源码
   * ----------------------------------------------------- */
  const nativeSourceMap = new WeakMap();

  /* -------------------------------------------------------
   * 3. 注册伪原生源码
   * ----------------------------------------------------- */
  const registerNativeSource = (fn, source) => {
    try {
      nativeSourceMap.set(fn, source);
    } catch (_) {}
  };

  /* -------------------------------------------------------
   * 4. 劫持 Function.prototype.toString
   * ----------------------------------------------------- */
  Object.defineProperty(Function.prototype, "toString", {
    configurable: true,
    writable: true,
    value: function toString() {
      if (nativeSourceMap.has(this)) {
        return nativeSourceMap.get(this);
      }
      return nativeFunctionToString.call(this);
    },
  });

  /* -------------------------------------------------------
   * 5. 伪装 Function.prototype.toString 自身
   * ----------------------------------------------------- */
  registerNativeSource(
    Function.prototype.toString,
    nativeFunctionToString.toString(),
  );

  /* -------------------------------------------------------
   * 6. stealthify：包装函数但保持"原生外观"
   * ----------------------------------------------------- */
  const stealthify = (obj, prop, handler) => {
    const original = obj[prop];
    if (typeof original !== "function") return;

    const wrapped = function (...args) {
      return handler.call(this, original, args);
    };
    const namePropertyDescriptor = Object.getOwnPropertyDescriptor(
      wrapped,
      "name",
    );
    // 处理函数 name 属性
    Object.defineProperty(wrapped, "name", {
      ...namePropertyDescriptor,
      value: prop,
    });
    // 保留 prototype（某些函数有）
    try {
      Object.setPrototypeOf(wrapped, Object.getPrototypeOf(original));
    } catch (_) {}

    // 注册伪原生源码（直接复用原函数的 native 表现）
    registerNativeSource(wrapped, nativeFunctionToString.call(original));

    // 用 defineProperty 保持 descriptor 接近原生
    const desc = Object.getOwnPropertyDescriptor(obj, prop);
    Object.defineProperty(obj, prop, {
      ...desc,
      value: wrapped,
    });
  };

  /* -------------------------------------------------------
   * 7. 示例：stealth console.log / debug / info
   * ----------------------------------------------------- */
  const filterConsoleArgs = (args) =>
    args.map((arg) => {
      if (arg && typeof arg === "object") {
        // 防止 getter / Proxy / 大对象触发
        return {};
      }
      return arg;
    });

  [
    "log",
    "debug",
    "info",
    "warn",
    "error",
    "dir",
    "table",
    "debug",
  ].forEach((name) => {
    stealthify(console, name, (original, args) => {
      // ❗不传递原始对象，避免 DevTools / CDP 展开
      return original.apply(console, filterConsoleArgs(args));
    });
  });

  /* -------------------------------------------------------
   * 8. 防御性补丁（可选但强烈建议）
   * ----------------------------------------------------- */

  // 防止检测 toString 被替换
  registerNativeSource(
    registerNativeSource,
    "function registerNativeSource() { [native code] }",
  );
};

async function handle(p) {
  // 1. 立即执行一次（针对当前已有的文档，防止错过）
  try {
    await p.evaluate(stealthScript);
  } catch (e) {
    // 如果当前页面还没准备好，忽略错误
  }
  // 2. 注册为新文档脚本（针对未来的导航）
  await p.evaluateOnNewDocument(stealthScript);
}

class Plugin extends PuppeteerExtraPlugin {
  constructor() {
    super();
  }

  get name() {
    return "laodeng";
  }

  async onBrowser(browser) {
    const pages = await browser.pages();
    for (const p of pages) {
      await handle(p);
    }
  }

  async onPageCreated(p) {
    await handle(p);
  }
}

module.exports = function (pluginConfig) {
  return new Plugin(pluginConfig);
};
