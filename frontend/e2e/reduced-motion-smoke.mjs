// Smoke: with prefers-reduced-motion, the app boots and the motion runtime
// hydrates without crashing. Drives /login (no backend needed) over CDP using
// Node's global WebSocket — the repo's Playwright-free browser-e2e pattern.
//
// Run: node e2e/reduced-motion-smoke.mjs   (dev server must be on :3000)
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000/login";
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9222;

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--no-first-run",
  "--user-data-dir=/tmp/rm-smoke-profile",
]);

async function cdpTargets() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // devtools endpoint not up yet
    }
    await sleep(300);
  }
  throw new Error("Chrome DevTools endpoint never came up");
}

function fail(msg) {
  console.error("FAIL:", msg);
  chrome.kill("SIGKILL");
  process.exit(1);
}

const ws = new WebSocket(await cdpTargets());
let id = 0;
const pending = new Map();
const errors = [];

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  }
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params.exceptionDetails.text ?? "uncaught exception");
  }
});

await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await send("Page.navigate", { url: APP_URL });
await sleep(3000);

const { result } = await send("Runtime.evaluate", {
  expression: "document.querySelectorAll('form, main, [role=dialog]').length",
  returnByValue: true,
});

if (typeof result.value !== "number" || result.value < 1) {
  fail(`expected page content, got ${JSON.stringify(result.value)}`);
}
if (errors.length > 0) {
  fail(`console errors:\n  ${errors.join("\n  ")}`);
}

console.log(`OK: page rendered ${result.value} landmark(s), no console errors (reduced-motion)`);
chrome.kill("SIGKILL");
process.exit(0);
