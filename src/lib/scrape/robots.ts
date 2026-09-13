/**
 * robots.txt : lu, jamais bloquant.
 * On lit les règles (Airbnb /s/…, Cozy /api, widget Gîtes Disallow: /)
 * puis on extrait quand même. Rien n’arrête un relevé.
 */

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsVerdict {
  allowed: boolean;
  rule: string | null;
}

export const ROBOTS_AGENT = "SkitrackRecon";

const CACHE_MS = 60 * 60 * 1000;
const FETCH_MS = 5_000;
const cache = new Map<string, { at: number; text: string }>();

function globToRe(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === "*") out += ".*";
    else if (c === "$" && i === pattern.length - 1) out += "$";
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(out);
}

function matches(pattern: string, path: string): boolean {
  try {
    return globToRe(pattern).test(path);
  } catch {
    return path.startsWith(pattern.replace(/\*$/, ""));
  }
}

function pickGroup(text: string, agent: string): string[] {
  const want = agent.trim().toLowerCase();
  const blocks: { agents: string[]; lines: string[] }[] = [];
  let current: { agents: string[]; lines: string[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const ua = /^user-agent:\s*(.+)$/i.exec(line);
    if (ua) {
      const name = ua[1].trim().toLowerCase();
      if (current && current.lines.length === 0) {
        current.agents.push(name);
      } else {
        current = { agents: [name], lines: [] };
        blocks.push(current);
      }
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
  }
  const specific = blocks.find((b) => b.agents.some((a) => a === want));
  const star = blocks.find((b) => b.agents.includes("*"));
  return (specific ?? star)?.lines ?? [];
}

export function parseRobots(text: string, agent = ROBOTS_AGENT): RobotsRule[] {
  const rules: RobotsRule[] = [];
  for (const line of pickGroup(text, agent)) {
    const allow = /^allow:\s*(.*)$/i.exec(line);
    const deny = /^disallow:\s*(.*)$/i.exec(line);
    if (allow) {
      const path = allow[1].trim();
      if (path) rules.push({ allow: true, path });
      continue;
    }
    if (deny) {
      const path = deny[1].trim();
      if (path) rules.push({ allow: false, path });
    }
  }
  return rules;
}

export function robotsAllows(rules: RobotsRule[], path: string): RobotsVerdict {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!matches(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length) best = rule;
  }
  if (!best) return { allowed: true, rule: null };
  return {
    allowed: best.allow,
    rule: `${best.allow ? "Allow" : "Disallow"}: ${best.path}`,
  };
}

export type Fetcher = (url: string) => Promise<{ status: number; text: string }>;

const defaultFetcher: Fetcher = async (url) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": ROBOTS_AGENT, accept: "text/plain,*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    return { status: res.status, text: res.status === 200 ? await res.text() : "" };
  } catch {
    return { status: 0, text: "" };
  } finally {
    clearTimeout(timer);
  }
};

function skipOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    if (u.hostname.endsWith(".local") || u.hostname === "localhost") return true;
    return false;
  } catch {
    return true;
  }
}

async function robotsText(origin: string, fetcher: Fetcher): Promise<string> {
  const hit = cache.get(origin);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  const url = `${origin.replace(/\/$/, "")}/robots.txt`;
  const res = await fetcher(url);
  const text = res.status === 200 ? res.text : "";
  cache.set(origin, { at: Date.now(), text });
  return text;
}

/** Lit robots.txt, journalise un Disallow, autorise toujours l’extraction. */
export async function allowsPath(
  origin: string,
  path: string,
  fetcher: Fetcher = defaultFetcher,
): Promise<RobotsVerdict> {
  if (skipOrigin(origin)) return { allowed: true, rule: null };
  const text = await robotsText(origin, fetcher);
  const matched = robotsAllows(parseRobots(text), path.startsWith("/") ? path : `/${path}`);
  if (!matched.allowed) {
    console.info(`[robots] ${origin}${path} ${matched.rule} — lu, ignoré, extraction continue`);
  }
  return { allowed: true, rule: matched.rule };
}

export function forgetRobots(): void {
  cache.clear();
}
