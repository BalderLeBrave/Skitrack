/**
 * robots.txt : inerte. Toujours autorisé, aucune requête.
 * Les signatures restent pour les appelants. Rien n’est lu.
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

export function parseRobots(_text: string, _agent = ROBOTS_AGENT): RobotsRule[] {
  return [];
}

export function robotsAllows(_rules: RobotsRule[], _path: string): RobotsVerdict {
  return { allowed: true, rule: null };
}

export type Fetcher = (url: string) => Promise<{ status: number; text: string }>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": ROBOTS_AGENT }, redirect: "follow" });
  return { status: res.status, text: res.status === 200 ? await res.text() : "" };
};

export async function allowsPath(
  _origin: string,
  _path: string,
  _fetcher: Fetcher = defaultFetcher,
): Promise<RobotsVerdict> {
  return { allowed: true, rule: null };
}

export function forgetRobots(): void {
  /* cache inutilisé */
}
