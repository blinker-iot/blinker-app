import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MessageChannel } from "node:worker_threads";

import { JSDOM } from "jsdom";

const parentOrigin = "http://127.0.0.1:4200";
const childOrigin = parentOrigin;
const parentUrl = `${parentOrigin}/device/device-template-test`;
const childUrl = new URL("/device-template/index.html", childOrigin);
childUrl.searchParams.set("blinkerParentOrigin", parentOrigin);
childUrl.searchParams.set("blinkerBundled", "1");

const parentDom = new JSDOM('<!doctype html><main id="host"></main>', {
  pretendToBeVisual: true,
  runScripts: "outside-only",
  url: parentUrl,
});
const childHtml = readFileSync(
  new URL("../dist/index.html", import.meta.url),
  "utf8"
);
const childScript = readFileSync(
  new URL("../dist/assets/device-template.js", import.meta.url),
  "utf8"
);
const penpalScript = readFileSync(
  new URL("../../node_modules/penpal/dist/penpal.js", import.meta.url),
  "utf8"
);
const childDom = new JSDOM(childHtml, {
  pretendToBeVisual: true,
  runScripts: "outside-only",
  url: childUrl,
});

const parentWindow = parentDom.window;
const childWindow = childDom.window;

Object.defineProperty(childWindow, "parent", {
  configurable: true,
  value: parentWindow,
});
Object.defineProperty(parentWindow, "MessageChannel", {
  configurable: true,
  value: MessageChannel,
});
Object.defineProperty(childWindow, "MessageChannel", {
  configurable: true,
  value: MessageChannel,
});

installPostMessageBridge(childWindow, parentWindow, parentOrigin);
installPostMessageBridge(parentWindow, childWindow, childOrigin);

parentWindow.eval(penpalScript);
const { CallOptions, WindowMessenger, connect } = parentWindow.Penpal;
const ready = promiseWithResolvers();
const context = createHostContext();
const hostCalls = [];

const messenger = new WindowMessenger({
  remoteWindow: childWindow,
  allowedOrigins: ["*"],
});
const connection = connect({
  messenger,
  channel: "blinker-device-ui-v1",
  timeout: 2000,
  methods: {
    getHostContext: () => {
      hostCalls.push("getHostContext");
      return context;
    },
    childReady: (payload) => {
      hostCalls.push("childReady");
      ready.resolve(payload);
      return { ok: true };
    },
    childError: ({ message }) => {
      ready.reject(new Error(message));
      return { ok: true };
    },
    sendDeviceCommand: () => ({ accepted: true }),
    getHistory: () => ({ ok: true, points: [] }),
  },
});

try {
  childWindow.eval(childScript);
  const childApi = await connection.promise;
  const readyPayload = await withTimeout(ready.promise, 2500);
  await waitFor(
    () =>
      childWindow.document.querySelector("#bridge-state")?.textContent ===
      "已连接设备宿主",
    1000
  );

  assert.equal(readyPayload.protocolVersion, 1);
  assert.deepEqual(hostCalls.slice(0, 2), ["childReady", "getHostContext"]);
  assert.equal(
    childWindow.document.querySelector("#bridge-state")?.textContent,
    "已连接设备宿主"
  );
  assert.equal(
    childWindow.document.querySelector("#device-name")?.textContent,
    context.device.name
  );
  assert.equal(await childApi.ping(new CallOptions({ timeout: 1000 })), "pong");

  const nextContext = structuredClone(context);
  nextContext.device.name = "Penpal 更新测试设备";
  await childApi.setHostContext(
    nextContext,
    new CallOptions({ timeout: 1000 })
  );
  assert.equal(
    childWindow.document.querySelector("#device-name")?.textContent,
    "Penpal 更新测试设备"
  );

  console.log("DEVICE_TEMPLATE_EMBEDDED_LOAD=PASS");
} finally {
  connection.destroy();
  childWindow.dispatchEvent(new childWindow.Event("pagehide"));
  parentWindow.close();
  childWindow.close();
}

function installPostMessageBridge(targetWindow, sourceWindow, sourceOrigin) {
  Object.defineProperty(targetWindow, "postMessage", {
    configurable: true,
    value(data, options = {}) {
      const targetOrigin =
        typeof options === "string" ? options : options.targetOrigin || "*";
      if (
        targetOrigin !== "*" &&
        targetOrigin !== targetWindow.location.origin
      ) {
        return;
      }
      const transfer = Array.isArray(options)
        ? options
        : options.transfer || [];
      const ports = transfer.filter(
        (item) =>
          item &&
          typeof item.postMessage === "function" &&
          typeof item.start === "function"
      );
      queueMicrotask(() => {
        const event = new targetWindow.Event("message");
        Object.defineProperties(event, {
          data: { value: data },
          origin: { value: sourceOrigin },
          ports: { value: ports },
          source: { value: sourceWindow },
        });
        targetWindow.dispatchEvent(event);
      });
    },
  });
}

function createHostContext() {
  return {
    protocolVersion: 1,
    capabilities: { commands: true, history: true },
    viewport: {
      headerHeight: 56,
      width: 390,
      height: 720,
      pixelRatio: 2,
    },
    device: {
      id: "device-template-test",
      deviceName: "device-template-test",
      name: "生成模板加载测试设备",
      type: "集成测试设备",
      mode: "mqtt",
      isPreview: true,
      showSwitch: true,
      data: {
        enable: true,
        state: "online",
        switch: "on",
        temperature: 24.6,
        humidity: 52,
        brightness: 68,
      },
    },
  };
}

function promiseWithResolvers() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function withTimeout(promise, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Embedded template timed out")),
      timeout
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function waitFor(predicate, timeout) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Embedded template state did not update in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
