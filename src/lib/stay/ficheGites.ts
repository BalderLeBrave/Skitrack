/**
 * Identité publique d'un gîte : le nom et l'URL tels que
 * gites-de-france.com les publie, pas un ancien slug du relevé figé.
 *
 * « Copains comme Cochons » (38G253122) n'existe plus à cette adresse :
 * la fiche s'appelle « Chalet les Copains ». Un 404 n'est pas un Cloudflare.
 */

import { lectureFiche } from "./lectureFiche.ts";
import { titreEstFichier } from "./titre.ts";

const CODE = /(\d{2}g\d{3,})/i;
const HOST = /gites-de-france\.com$/i;
const BOT = /attention required|just a moment|cf-challenge|cf-browser-verification|you have been blocked/i;

export const FICHE_INTROUVABLE = "fiche introuvable";

export function codeGitesOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = CODE.exec(raw);
  return m ? m[1].toUpperCase() : null;
}

/** Alias Drupal : minuscules, sans accent, apostrophe fondue. */
export function slugGites(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function slugUrlGites(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const last = (new URL(url).pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.html?$/i, "");
    const code = codeGitesOf(last);
    if (!code) return null;
    const slug = last.slice(0, last.toLowerCase().lastIndexOf(code.toLowerCase())).replace(/-+$/g, "");
    return slug || null;
  } catch {
    return null;
  }
}

/**
 * Recolle le nom publié sur le chemin régional déjà connu.
 * `…/isere/copains-comme-cochons-38g253122` + « Chalet les Copains »
 * → `…/isere/chalet-les-copains-38g253122`.
 */
export function urlGitesDepuisNom(url: string, nom: string): string | null {
  const code = codeGitesOf(url);
  const slug = slugGites(nom);
  if (!code || !slug) return null;
  try {
    const u = new URL(url);
    if (!HOST.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const last = (parts.at(-1) ?? "").replace(/\.html?$/i, "");
    if (!CODE.test(last)) return null;
    const next = `${slug}-${code.toLowerCase()}`;
    if (last.toLowerCase() === next) return null;
    parts[parts.length - 1] = next;
    u.pathname = `/${parts.join("/")}`;
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** 404 / « page introuvable ». Un défi Cloudflare n'est pas une absence. */
export function estPageGitesIntrouvable(html: string, status?: number): boolean {
  if (status === 404) return true;
  if (status === 403 || status === 503 || status === 429) return false;
  if (!html) return false;
  if (BOT.test(html)) return false;
  return /page introuvable/i.test(html);
}

export function estFicheGitesIntrouvable(l: { source?: string; proven?: string }): boolean {
  return l.source === "Gîtes de France" && new RegExp(FICHE_INTROUVABLE, "i").test(l.proven ?? "");
}

export function nomGitesPublie(html: string): string | null {
  const t = lectureFiche(html).title;
  if (!t || titreEstFichier(t)) return null;
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Pose le nom publié et, si le slug de l'URL ne lui correspond plus,
 * l'URL publique actuelle. Rien n'est inventé : le nom vient de la fiche.
 */
export function alignerIdentiteGites<
  T extends { source: string; title: string; url: string | null; proven: string },
>(l: T, html: string): T {
  if (l.source !== "Gîtes de France") return l;
  const nom = nomGitesPublie(html);
  if (!nom) return l;
  let url = l.url;
  let proven = l.proven;
  const next = url ? urlGitesDepuisNom(url, nom) : null;
  if (next) {
    url = next;
    if (!/fiche/.test(proven)) proven = `${proven} · fiche`;
  }
  return { ...l, title: nom, url, proven };
}

export function marquerFicheIntrouvable<T extends { proven: string }>(l: T): T {
  if (new RegExp(FICHE_INTROUVABLE, "i").test(l.proven)) return l;
  return { ...l, proven: `${l.proven} · ${FICHE_INTROUVABLE}` };
}
