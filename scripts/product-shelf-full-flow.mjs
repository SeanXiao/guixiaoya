import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { WebSocket } from "ws";

const appUrl = process.env.PRODUCT_SHELF_URL || "http://127.0.0.1:5173/";
const apiUrl = process.env.PRODUCT_SHELF_API_URL || "http://127.0.0.1:8787";
const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.PRODUCT_SHELF_CDP_PORT || 9360);
const flowTimeoutMs = Number(process.env.PRODUCT_FULL_FLOW_TIMEOUT_MS || 180000);
const screenshotPath = process.env.PRODUCT_FULL_FLOW_SCREENSHOT || "/tmp/yuanyuan-qa-generated-confirm.png";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function listBooks() {
  const data = await readJson(`${apiUrl}/api/picture-books`);
  return data.books || [];
}

async function getBook(id) {
  const data = await readJson(`${apiUrl}/api/picture-books/${encodeURIComponent(id)}`);
  if (!data.book) {
    throw new Error(`Could not load generated book ${id}`);
  }
  return data.book;
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = {
    console: [],
    exceptions: [],
    failedRequests: [],
    log: []
  };

  ws.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result || {});
      }
      return;
    }

    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
      events.console.push(message.params.args.map((arg) => arg.value || arg.description || "").join(" "));
    }
    if (message.method === "Runtime.exceptionThrown") {
      events.exceptions.push(message.params.exceptionDetails?.text || message.params.exceptionDetails?.exception?.description || "exception");
    }
    if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) {
      events.log.push(message.params.entry.text);
    }
    if (message.method === "Network.loadingFailed") {
      events.failedRequests.push(`${message.params.errorText} ${message.params.blockedReason || ""}`.trim());
    }
  });

  function send(method, params = {}) {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
  }

  async function evaluate(fn, arg) {
    const result = await send("Runtime.evaluate", {
      awaitPromise: true,
      expression: `(${fn})(${JSON.stringify(arg)})`,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }

  async function waitFor(fn, arg, timeout = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const value = await evaluate(fn, arg).catch(() => null);
      if (value) {
        return value;
      }
      await sleep(250);
    }
    throw new Error("Timed out waiting for UI state");
  }

  return { close: () => ws.close(), evaluate, events, send, waitFor, ws };
}

async function waitForNewBook(beforeIds) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < flowTimeoutMs) {
    const created = (await listBooks()).find((book) => !beforeIds.has(book.id));
    if (created) {
      return created.id;
    }
    await sleep(1000);
  }
  throw new Error("No generated book appeared in the API");
}

async function waitForFourImages(bookId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < flowTimeoutMs) {
    const book = await getBook(bookId);
    if (book.pages.filter((page) => page.imageUrl).length === 4) {
      return book;
    }
    await sleep(1000);
  }
  throw new Error("Generated book did not receive all 4 page images");
}

async function waitForBookDeleted(bookId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (!(await listBooks()).some((book) => book.id === bookId)) {
      return;
    }
    await sleep(500);
  }
  throw new Error("Generated book still exists after UI delete");
}

async function captureScreenshot(client) {
  const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
}

async function main() {
  await fetch(appUrl, { method: "HEAD" }).catch(() => {
    throw new Error(`Product shelf app is not reachable at ${appUrl}. Start npm run dev first.`);
  });

  const beforeIds = new Set((await listBooks()).map((book) => book.id));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/product-shelf-full-flow-${Date.now()}`,
    "--window-size=1440,1100",
    appUrl
  ], { stdio: "ignore" });

  let client;
  let generatedBookId;
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        await readJson(`http://127.0.0.1:${port}/json/list`);
        break;
      } catch {
        await sleep(150);
      }
    }

    const targets = await readJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find((target) => target.type === "page");
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error("Could not find a Chrome page target");
    }

    client = createCdpClient(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      client.ws.once("open", resolve);
      client.ws.once("error", reject);
    });
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Log.enable");
    await client.send("Network.enable");
    await client.send("Page.navigate", { url: appUrl });
    await sleep(1000);
    await client.evaluate(() => {
      window.__productShelfFullFlowUnhandled = [];
      window.addEventListener("unhandledrejection", (event) => {
        window.__productShelfFullFlowUnhandled.push(String(event.reason?.message || event.reason || "unhandled"));
        event.preventDefault();
      });
      window.HTMLMediaElement.prototype.play = () => Promise.resolve();
      if (window.speechSynthesis) {
        window.speechSynthesis.speak = () => undefined;
        window.speechSynthesis.cancel = () => undefined;
      }
      return true;
    });

    await client.waitFor(() => document.body.innerText.includes("我的绘本书架"));
    await client.evaluate(() => {
      [...document.querySelectorAll(".product-nav button")].find((button) => button.textContent.includes("我的书桌"))?.click();
      return true;
    });
    await client.waitFor(() => Boolean(document.querySelector(".product-classic-desk .left-panel")) && Boolean(document.querySelector(".idea-box")));

    const idea = `完整链路确认测试：我在青秀山做五色糯米饭故事书 ${Date.now()}`;
    await client.evaluate((ideaText) => {
      const textarea = document.querySelector(".idea-box textarea");
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, ideaText);
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
      [...document.querySelectorAll(".language-switch button")].find((button) => button.textContent.trim() === "中文")?.click();
      [...document.querySelectorAll(".language-switch button")].find((button) => button.textContent.trim() === "女孩")?.click();
      const checkbox = document.querySelector(".toggle-line input");
      if (checkbox && !checkbox.checked) {
        checkbox.click();
      }
      document.querySelector(".idea-box")?.requestSubmit();
      return true;
    }, idea);

    generatedBookId = await waitForNewBook(beforeIds);
    const generatedBook = await waitForFourImages(generatedBookId);
    if (/肖予曦|桂小灵|Gui Xiaoling|Xiaoyuxi/u.test(JSON.stringify(generatedBook))) {
      throw new Error("Generated book still contains old participant or companion names");
    }
    await client.waitFor(() => {
      const detailReady = Boolean(document.querySelector(".book-view"));
      return detailReady && (document.body.innerText.includes("打开故事书") || document.body.innerText.includes("Open Storybook")) ? true : null;
    }, null, 30000);
    await client.evaluate(() => {
      [...document.querySelectorAll(".product-nav button")].find((button) => button.textContent.includes("创作记录"))?.click();
      return true;
    });
    await client.waitFor(() => {
      const text = document.body.innerText;
      return Boolean(document.querySelector(".records-page")) && text.includes("核心创建故事提示词") && document.querySelectorAll(".record-tab-button").length === 3 ? true : null;
    }, null, 30000);
    await client.evaluate(() => {
      [...document.querySelectorAll(".record-tab-button")].find((button) => button.textContent.includes("故事输出"))?.click();
      return true;
    });
    await client.waitFor(() => document.body.innerText.includes("各页故事与插图提示词") && document.querySelectorAll(".record-page-tab").length >= 4, null, 30000);

    await client.evaluate(() => {
      [...document.querySelectorAll(".product-nav button")].find((button) => button.textContent.includes("我的书架"))?.click();
      return true;
    });
    await client.waitFor(() => location.hash === "#/shelf" && Boolean(document.querySelector(".bookshelf-panel")) && document.querySelectorAll(".cover-delete").length > 0);
    await captureScreenshot(client);

    await client.evaluate(() => {
      const buttons = [...document.querySelectorAll(".cover-delete")].filter((button) => button instanceof HTMLElement && button.offsetParent !== null);
      const button = buttons[0];
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return Boolean(button);
    });
    await client.waitFor(() => Boolean(document.querySelector(".confirm-dialog")));
    await client.evaluate(() => {
      [...document.querySelectorAll(".confirm-actions button")].find((button) => button.textContent.includes("删除"))?.click();
      return true;
    });
    await waitForBookDeleted(generatedBookId);
    generatedBookId = undefined;

    const unhandled = await client.evaluate(() => window.__productShelfFullFlowUnhandled || []);
    const seriousConsole = client.events.console.filter((line) => !/React DevTools/u.test(line));
    const seriousLog = client.events.log.filter((line) => !/favicon|React DevTools|404/u.test(line));
    if (unhandled.length || client.events.exceptions.length || seriousConsole.length || seriousLog.length) {
      throw new Error(`Browser reported runtime issues: ${JSON.stringify({ unhandled, exceptions: client.events.exceptions, console: seriousConsole, log: seriousLog })}`);
    }

    console.log(JSON.stringify({
      ok: true,
      generatedTitle: generatedBook.title,
      imageSources: [...new Set(generatedBook.pages.map((page) => page.imageSource))],
      screenshotPath,
      results: [
        "PASS inspiration form submits",
        "PASS book draft is saved",
        "PASS 4 page images are generated",
        "PASS generated records page shows core and page prompts",
        "PASS shelf renders generated book",
        "PASS delete confirmation opens",
        "PASS generated book deletes from shelf",
        "PASS no runtime errors"
      ]
    }, null, 2));
  } finally {
    if (generatedBookId) {
      await fetch(`${apiUrl}/api/picture-books/${encodeURIComponent(generatedBookId)}`, { method: "DELETE" }).catch(() => {});
    }
    client?.close();
    chrome.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
