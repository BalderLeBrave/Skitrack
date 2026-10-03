/**
 * Plus › Clés : ce que l'application a besoin qu'on lui donne.
 *
 * Une clé manquante rendait l'application muette sur une partie de ce qu'elle
 * sait faire, sans dire laquelle ni comment y remédier — et la seule clé du
 * dépôt était écrite en dur dans le code. Cet écran liste ce qui est attendu,
 * dit ce qui ne marche pas sans, reçoit la valeur, et propose de l'essayer
 * pour de bon.
 *
 * **Un secret ne revient jamais ici.** Le champ est toujours vide à l'ouverture
 * et l'écran n'apprend du serveur qu'une chose : posée ou non, et d'où.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { essayerCle, listerCles, poserCle, retirerCle, type Essai } from "@/lib/cles/api";
import { CLES, type EtatCle } from "@/lib/cles/registre";
import { aTraduire, tr, trN } from "@/lib/i18n";

export const Route = createFileRoute("/cles")({ component: ClesPage });

function ClesPage() {
  const [etats, setEtats] = useState<EtatCle[] | null>(null);
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [occupe, setOccupe] = useState<string | null>(null);
  const [essais, setEssais] = useState<Record<string, Essai>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    void listerCles({ data: {} })
      .then(setEtats)
      .catch((e: unknown) => {
        console.warn("[cles] lecture en échec", e);
        setErreur(e instanceof Error ? e.message : String(e));
      });
  }, []);
  useEffect(charger, [charger]);

  async function poser(id: string) {
    const valeur = (saisies[id] ?? "").trim();
    if (!valeur || occupe) return;
    setOccupe(id);
    setErreur(null);
    try {
      setEtats(await poserCle({ data: { id, valeur } }));
      // Le champ se vide : la valeur vit sur le serveur, pas dans cet écran.
      setSaisies((s) => ({ ...s, [id]: "" }));
      setEssais((e) => ({ ...e, [id]: { ok: true, message: aTraduire("Clé enregistrée sur cette machine.") } }));
    } catch (e: unknown) {
      console.warn(`[cles] ${id} : enregistrement en échec`, e);
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(null);
    }
  }

  async function retirer(id: string) {
    if (occupe) return;
    setOccupe(id);
    try {
      setEtats(await retirerCle({ data: { id } }));
      setEssais((e) => ({ ...e, [id]: { ok: true, message: aTraduire("Clé retirée de cette machine.") } }));
    } catch (e: unknown) {
      console.warn(`[cles] ${id} : retrait en échec`, e);
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(null);
    }
  }

  async function essayer(id: string) {
    if (occupe) return;
    setOccupe(id);
    try {
      const r = await essayerCle({ data: { id } });
      setEssais((e) => ({ ...e, [id]: r }));
    } catch (e: unknown) {
      setEssais((e2) => ({
        ...e2,
        [id]: { ok: false, message: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setOccupe(null);
    }
  }

  const etat = (id: string) => etats?.find((e) => e.id === id) ?? null;
  // Une clé facultative absente ne manque pas : l'application fait sans.
  const attendues = CLES.filter((c) => !c.facultative);
  const manquantes = etats ? attendues.filter((c) => !etat(c.id)?.posee).length : 0;

  return (
    <Coquille>
      <div className="cles">
        <header className="cles__tete">
          <h1 className="font-display text-affiche tracking-tight">{tr("Clés")}</h1>
          <p className="cles__lead">
            {tr(
              "Les clés dont l’application a besoin pour fonctionner entièrement. Chaque clé est gardée sur cette machine, en clair, dans votre dossier de configuration. Elle n’est envoyée nulle part ailleurs.",
            )}
          </p>
          {etats ? (
            <p className="cles__compte" aria-live="polite">
              {manquantes > 0
                ? trN(manquantes, "{n} clé sur {total} reste à renseigner.", "{n} clés sur {total} restent à renseigner.", { total: attendues.length })
                : CLES.every((c) => etat(c.id)?.posee)
                  ? tr("Les {n} clés sont renseignées.", { n: CLES.length })
                  : tr("Rien ne reste à renseigner.")}
            </p>
          ) : null}
        </header>

        {erreur ? (
          <p className="cles__erreur" role="status">
            {erreur}
            <button type="button" className="lien-doux" onClick={() => setErreur(null)}>
              {tr("Masquer")}
            </button>
          </p>
        ) : null}

        <ul className="cles__liste">
          {CLES.map((c) => {
            const e = etat(c.id);
            const essai = essais[c.id];
            return (
              <li key={c.id} className="cle">
                <div className="cle__tete">
                  <div>
                    <h2>{tr(c.label)}</h2>
                    <p className="cle__sert">{tr(c.sert)}</p>
                  </div>
                  <span
                    className={`cle__etat cle__etat--${e?.posee ? "posee" : c.facultative ? "facultative" : "absente"}`}
                  >
                    {!etats
                      ? "…"
                      : e?.posee
                        ? e.origine === "environnement"
                          ? tr("définie par une variable d’environnement")
                          : tr("enregistrée sur cette machine")
                        : c.facultative
                          ? tr("facultative")
                          : tr("absente")}
                  </span>
                </div>

                <p className={`cle__sans${e?.posee || c.facultative ? " cle__sans--tenue" : ""}`}>
                  {e?.posee || c.facultative ? tr("Sans elle : ") : tr("Ce qui ne marche pas sans elle : ")}
                  {tr(c.sans)}
                </p>

                {e?.origine === "environnement" ? (
                  <p className="cle__note">
                    {tr("Elle vient de la variable")} <code>{c.env[0]}</code>
                    {tr(", définie au lancement. C’est elle qui fait foi ; une clé saisie ici ne la remplacerait pas.")}
                  </p>
                ) : (
                  <div className="cle__saisie">
                    <label className="cle__champ">
                      <span>{c.secret ? tr("Coller la clé") : tr("Valeur")}</span>
                      <input
                        type={c.secret ? "password" : "text"}
                        value={saisies[c.id] ?? ""}
                        placeholder={c.exemple ? tr(c.exemple) : ""}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(ev) => setSaisies((s) => ({ ...s, [c.id]: ev.target.value }))}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") void poser(c.id);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn7"
                      disabled={!!occupe || !(saisies[c.id] ?? "").trim()}
                      onClick={() => void poser(c.id)}
                    >
                      {occupe === c.id ? "…" : tr("Enregistrer")}
                    </button>
                  </div>
                )}

                {e?.valeur && !c.secret ? (
                  <p className="cle__note">
                    {tr("Valeur retenue :")} <code>{e.valeur}</code>
                  </p>
                ) : null}

                <div className="cle__pied">
                  {c.obtenir ? (
                    <a href={c.obtenir.url} target="_blank" rel="noopener" className="cle__lien">
                      {tr(c.obtenir.texte)}
                      <Icon name="externe" taille={12} />
                    </a>
                  ) : null}
                  {c.essayable && e?.posee ? (
                    <button
                      type="button"
                      className="lien-doux"
                      disabled={!!occupe}
                      onClick={() => void essayer(c.id)}
                    >
                      {occupe === c.id ? tr("Essai en cours…") : tr("Essayer la clé")}
                    </button>
                  ) : null}
                  {e?.origine === "saisie" ? (
                    <button
                      type="button"
                      className="lien-doux"
                      disabled={!!occupe}
                      onClick={() => void retirer(c.id)}
                    >
                      {tr("Retirer de cette machine")}
                    </button>
                  ) : null}
                </div>

                {essai ? (
                  <p className={`cle__essai cle__essai--${essai.ok ? "ok" : "ko"}`} role="status">
                    {tr(essai.message, essai.vars)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <p className="cles__note">
          {tr(
            "Une clé définie par une variable d’environnement au lancement l’emporte toujours sur une clé saisie ici.",
          )}
        </p>
      </div>
    </Coquille>
  );
}
