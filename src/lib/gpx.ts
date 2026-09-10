import { metresBetween } from "./access";

export type GpxPoint = {
  lat: number;
  lon: number;
  ele: number | null;
  timeMs: number | null;
};

export type GpxStats = {
  name: string;
  points: number;
  km: number;
  dPlusM: number | null;
  dMinusM: number | null;
  eleMin: number | null;
  eleMax: number | null;
  eleStart: number | null;
  eleEnd: number | null;
  durationSec: number | null;
  speedKmh: number | null;
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
};

export type GpxTrack = {
  name: string;
  points: GpxPoint[];
  stats: GpxStats;
};

const MAX_POINTS = 2500;
const ELE_NOISE_M = 1;

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i");
  return re.exec(tag)?.[1] ?? null;
}

function inner(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

function num(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parsePts(xml: string, tag: "trkpt" | "rtept"): GpxPoint[] {
  const out: GpxPoint[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>|<${tag}\\b([^>]*)/>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const head = m[1] ?? m[3] ?? "";
    const body = m[2] ?? "";
    const lat = num(attr(head, "lat"));
    const lon = num(attr(head, "lon"));
    if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const ele = num(inner(body, "ele"));
    const timeRaw = inner(body, "time");
    const t = timeRaw ? Date.parse(timeRaw) : NaN;
    out.push({
      lat,
      lon,
      ele,
      timeMs: Number.isFinite(t) ? t : null,
    });
  }
  return out;
}

export function downsample<T>(pts: T[], max: number): T[] {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

export function summarize(name: string, pts: GpxPoint[]): GpxStats {
  const start = pts[0];
  const end = pts[pts.length - 1];
  let metres = 0;
  let dPlus = 0;
  let dMinus = 0;
  let eleMin: number | null = null;
  let eleMax: number | null = null;
  let hasEleDelta = false;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.ele != null) {
      eleMin = eleMin == null ? p.ele : Math.min(eleMin, p.ele);
      eleMax = eleMax == null ? p.ele : Math.max(eleMax, p.ele);
    }
    if (i === 0) continue;
    metres += metresBetween(pts[i - 1].lat, pts[i - 1].lon, p.lat, p.lon);
    const a = pts[i - 1].ele;
    const b = p.ele;
    if (a == null || b == null) continue;
    const d = b - a;
    if (Math.abs(d) < ELE_NOISE_M) continue;
    hasEleDelta = true;
    if (d > 0) dPlus += d;
    else dMinus += -d;
  }
  const t0 = start.timeMs;
  const t1 = end.timeMs;
  const durationSec = t0 != null && t1 != null && t1 > t0 ? Math.round((t1 - t0) / 1000) : null;
  const km = metres / 1000;
  return {
    name,
    points: pts.length,
    km,
    dPlusM: hasEleDelta ? Math.round(dPlus) : null,
    dMinusM: hasEleDelta ? Math.round(dMinus) : null,
    eleMin: eleMin == null ? null : Math.round(eleMin),
    eleMax: eleMax == null ? null : Math.round(eleMax),
    eleStart: start.ele == null ? null : Math.round(start.ele),
    eleEnd: end.ele == null ? null : Math.round(end.ele),
    durationSec,
    speedKmh: durationSec && durationSec > 0 ? (km / durationSec) * 3600 : null,
    start: { lat: start.lat, lon: start.lon },
    end: { lat: end.lat, lon: end.lon },
  };
}

export function parseGpx(xml: string, fileName = "trace.gpx"): GpxTrack {
  const trimmed = xml.trim();
  if (!trimmed) throw new Error("Fichier vide.");
  if (!/<gpx[\s>]|<trkpt[\s>]|<rtept[\s>]/i.test(trimmed)) {
    throw new Error("Ce fichier n’est pas un GPX.");
  }
  const pts = [...parsePts(trimmed, "trkpt"), ...parsePts(trimmed, "rtept")];
  if (pts.length < 2) throw new Error("Pas assez de points GPS dans ce GPX.");
  const kept = downsample(pts, MAX_POINTS);
  const trkName = inner(trimmed, "name");
  const name = (trkName && trkName.slice(0, 80)) || fileName.replace(/\.gpx$/i, "");
  return { name, points: kept, stats: summarize(name, kept) };
}

export function formatKm(km: number): string {
  return `${km.toLocaleString("fr-FR", { maximumFractionDigits: km < 10 ? 2 : 1 })} km`;
}

export function formatEle(m: number | null | undefined): string {
  if (m == null) return "non mesurée";
  return `${m.toLocaleString("fr-FR")} m`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return "non mesurée";
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${min} min`;
  return `${h} h ${min.toString().padStart(2, "0")}`;
}

export function profileSeries(pts: GpxPoint[]): { km: number; ele: number }[] {
  const withEle = pts.filter((p) => p.ele != null);
  if (withEle.length < 2) return [];
  const sampled = downsample(pts, 220);
  const out: { km: number; ele: number }[] = [];
  let km = 0;
  let last: GpxPoint | null = null;
  for (const p of sampled) {
    if (last) km += metresBetween(last.lat, last.lon, p.lat, p.lon) / 1000;
    last = p;
    if (p.ele == null) continue;
    out.push({ km, ele: p.ele });
  }
  return out;
}
