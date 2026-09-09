import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export const SCRAPE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BLOCK_URL =
  /tiktok|google-analytics|googletagmanager|doubleclick|facebook\.net|facebook\.com|hotjar|sentry\.io|maps\.googleapis|maps\.gstatic|google\.com\/maps|id5-sync|taboola|outbrain|scorecardresearch/i;

async function stripWeight(ctx: BrowserContext): Promise<void> {
  await ctx.route("**/*", (route) => {
    const url = route.request().url();
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") {
      void route.abort();
      return;
    }
    if (BLOCK_URL.test(url)) {
      void route.abort();
      return;
    }
    void route.continue();
  });
}

const LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-extensions",
];

let pooled: Browser | null = null;
let poolWait: Promise<Browser> | null = null;
let busy = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (busy > 0) return;
    const b = pooled;
    pooled = null;
    poolWait = null;
    void b?.close().catch(() => undefined);
  }, 180_000);
}

async function getBrowser(): Promise<Browser> {
  if (pooled?.isConnected()) return pooled;
  if (poolWait) return poolWait;
  poolWait = chromium
    .launch({ headless: true, args: LAUNCH_ARGS })
    .then((b) => {
      pooled = b;
      b.on("disconnected", () => {
        if (pooled === b) {
          pooled = null;
          poolWait = null;
        }
      });
      return b;
    })
    .catch((err) => {
      poolWait = null;
      throw err;
    });
  return poolWait;
}

export async function withBrowser<T>(fn: (open: () => Promise<Page>) => Promise<T>): Promise<T> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  busy += 1;
  const contexts: BrowserContext[] = [];
  try {
    const browser = await getBrowser();
    const open = async (): Promise<Page> => {
      const ctx = await browser.newContext({
        locale: "fr-FR",
        userAgent: SCRAPE_UA,
        viewport: { width: 1280, height: 800 },
        extraHTTPHeaders: { "Accept-Language": "fr-FR,fr;q=0.9" },
      });
      contexts.push(ctx);
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });
      await stripWeight(ctx);
      const page = await ctx.newPage();
      page.setDefaultTimeout(25_000);
      return page;
    };
    return await fn(open);
  } finally {
    await Promise.all(contexts.map((c) => c.close().catch(() => undefined)));
    busy -= 1;
    if (busy <= 0) scheduleIdleClose();
  }
}
