/**
 * L'identité du serveur de l'application installée : `desktop/main.mjs` tire
 * un jeton à chaque lancement (`SKITRACK_INSTANCE`) et n'ouvre la fenêtre que
 * si `GET /__skitrack/instance` le lui rend. Le port étant fixe (4731), un
 * autre serveur pourrait y répondre : SKITRACK ouvert dans une autre session
 * Windows, avec ses clés, ou un serveur resté d'une version précédente. Sans
 * ce contrôle, la fenêtre l'affichait sans rien dire.
 *
 * Hors de l'application installée (développement, Vercel), la variable n'est
 * pas posée et la route n'existe pas.
 */

interface Evenement {
  url: URL;
  req: { method: string };
}

export default function instance(event: Evenement, next: () => unknown): unknown {
  const jeton = process.env.SKITRACK_INSTANCE;
  if (!jeton || event.url.pathname !== "/__skitrack/instance") return next();
  if ((event.req.method ?? "GET").toUpperCase() !== "GET") return next();
  return Response.json({ instance: jeton }, { headers: { "cache-control": "no-store" } });
}
