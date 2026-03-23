import { PuppeteerExtraPlugin } from "puppeteer-extra-plugin";
import type { Page, Browser } from "puppeteer";

async function handle(p: Page): Promise<void> {
  await p.evaluateOnNewDocument(() => {
    (() => {
      "use strict";
      const nativeFunctionToString = Function.prototype.toString;

      const nativeSourceMap = new WeakMap<Function, string>();

      const registerNativeSource = (fn: Function, source: string): void => {
        try {
          nativeSourceMap.set(fn, source);
        } catch (_) {}
      };

      Object.defineProperty(Function.prototype, "toString", {
        configurable: true,
        writable: true,
        value: function toString(this: Function): string {
          if (nativeSourceMap.has(this)) {
            return nativeSourceMap.get(this)!;
          }
          return nativeFunctionToString.call(this);
        },
      });

      registerNativeSource(
        Function.prototype.toString,
        nativeFunctionToString.toString(),
      );

      const stealthify = (obj: any, prop: string, handler: (original: Function, args: any[]) => any): void => {
        const original = obj[prop];
        if (typeof original !== "function") return;

        const wrapped = function(this: any, ...args: any[]): any {
          return handler.call(this, original, args);
        };
        const namePropertyDescriptor = Object.getOwnPropertyDescriptor(
          wrapped,
          "name",
        );
        Object.defineProperty(wrapped, "name", {
          ...namePropertyDescriptor,
          value: prop,
        });
        try {
          Object.setPrototypeOf(wrapped, Object.getPrototypeOf(original));
        } catch (_) {}

        registerNativeSource(wrapped, nativeFunctionToString.call(original));

        const desc = Object.getOwnPropertyDescriptor(obj, prop);
        Object.defineProperty(obj, prop, {
          ...desc,
          value: wrapped,
        });
      };

      const filterConsoleArgs = (args: any[]): any[] =>
        args.map((arg) => {
          if (arg && typeof arg === "object") {
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
      ].forEach((name: string) => {
        stealthify(console, name, (original: Function, args: any[]) => {
          return original.apply(console, filterConsoleArgs(args));
        });
      });

      registerNativeSource(
        registerNativeSource,
        "function registerNativeSource() { [native code] }",
      );
    })();
  });
}

class Plugin extends PuppeteerExtraPlugin {
  constructor() {
    super();
  }

  get name(): string {
    return "laodeng";
  }

  async onBrowser(browser: Browser): Promise<void> {
    const pages = await browser.pages();
    for (const p of pages) {
      await handle(p);
    }
  }

  async onPageCreated(p: Page): Promise<void> {
    await handle(p);
  }
}

export default function (pluginConfig?: any): Plugin {
  return new Plugin();
}
