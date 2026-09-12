import { stayRangeLabel } from "@/lib/stay/calendar";
import { formatEuro } from "@/lib/listings";
import {
  buildReport,
  fiabiliteLabel,
  ORIGINE_LABEL,
  type Report,
  type ReportInput,
  type ReportPoste,
} from "@/lib/stay/report";

/**
 * Récapitulatif imprimable du séjour retenu.
 *
 * ## Ce qu'il fait, et ce qu'il ne fait pas
 *
 * Il met en page ce que l'application sait déjà. Il ne relève rien, il ne
 * calcule rien de neuf, et surtout il **n'invente rien** : chaque montant porte
 * son origine, exactement comme à l'écran. Une valeur absente reste absente, et
 * la dernière section les énumère plutôt que de les taire. C'est la section la
 * plus utile du document : un récapitulatif qui tait ses trous laisse croire
 * qu'il n'en a pas.
 *
 * ## Deux choses qu'il ne fait volontairement pas
 *
 * Il ne redessine pas sa propre carte. L'original en avait une, `StayReportMap`,
 * 227 lignes qui refaisaient ce que `MapPanel` fait déjà. C'est `MapPanel` qui
 * est utilisé, avec une épingle de type `listing`.
 *
 * Il n'intègre **aucun plan des pistes officiel**. Ce sont des œuvres
 * graphiques protégées, même si le catalogue en porte l'URL pour chaque
 * station.
 *
 * ## L'impression
 *
 * `print:` masque la carte et les commandes, et passe le corps en une colonne.
 * Une carte imprimée en niveaux de gris ne renseigne personne, et les boutons
 * sur papier sont du bruit.
 */

function OrigineTag({ origine }: { origine: ReportPoste["origine"] }) {
  const ton =
    origine === "estimé"
      ? "text-cta"
      : origine === "néant"
        ? "text-muted"
        : origine === "saisi"
          ? "text-marque-texte"
          : "text-muted";
  return <span className={`text-note ${ton}`}>{ORIGINE_LABEL[origine]}</span>;
}

function Ligne({ poste }: { poste: ReportPoste }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-line py-1.5">
      <div>
        <span className="text-corps">{poste.label}</span> <OrigineTag origine={poste.origine} />
        {poste.detail && <p className="text-note text-muted">{poste.detail}</p>}
      </div>
      <span className="text-corps font-semibold tabular-nums">
        {/* Le « ≈ » devant une estimation : le lecteur doit le voir sans avoir
            à relire l'étiquette d'origine. */}
        {poste.origine === "estimé" ? "≈ " : ""}
        {formatEuro(poste.montant)}
      </span>
    </div>
  );
}

export function StayReport({
  input,
  lat,
  lon,
  listingTitle,
}: {
  input: ReportInput;
  /** Position du logement, dite en toutes lettres. Absente : elle est dite absente. */
  lat?: number | null;
  lon?: number | null;
  listingTitle?: string;
}) {
  const report: Report = buildReport(input);

  return (
    <article
      className="flex flex-col gap-4 rounded-surface border border-line bg-panel p-5 print:gap-3 print:border-0 print:p-0"
      id="stay-report"
      data-testid="stay-report"
    >
      <header>
        <h1 className="text-section font-semibold">{input.stationName}</h1>
        <p className="mt-1 text-corps text-muted">
          {stayRangeLabel(input.checkIn, input.checkOut)}, {input.voyageurs} voyageur
          {input.voyageurs > 1 ? "s" : ""}
        </p>
        <p className="mt-1 text-note text-muted">
          Document composé le {new Date().toLocaleDateString("fr-FR")} à partir de ce que
          l’application a relevé. Aucun chiffre n’y est ajouté.
        </p>
      </header>

      {/* La carte a quitté ce document : il doit tenir sur une A4, et elle
          n'était de toute façon jamais imprimée, la section portait
          `print:hidden`. Ce qu'elle montrait se dit ici en toutes lettres, et
          s'imprime. */}
      {listingTitle || (lat != null && lon != null) ? (
        <section>
          <h2 className="text-note text-muted">Situation</h2>
          {listingTitle ? <p className="mt-2 text-corps">{listingTitle}</p> : null}
          {lat != null && lon != null ? (
            <p className="mt-1 text-note text-muted tabular-nums">
              {lat.toFixed(4)}, {lon.toFixed(4)}
            </p>
          ) : (
            <p className="mt-1 text-note text-muted">Position du logement non communiquée.</p>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="text-note text-muted">Budget</h2>
        {report.postes.length === 0 ? (
          <p className="mt-2 text-corps text-muted">
            Aucun montant connu. Rien n’est chiffré ici, et la section suivante dit pourquoi.
          </p>
        ) : (
          <div className="mt-2">
            {report.postes.map((p) => (
              <Ligne key={p.label} poste={p} />
            ))}
            <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 pt-2">
              <span className="text-corps font-semibold">Total</span>
              <span className="text-section font-semibold tabular-nums">
                {formatEuro(report.total)}
              </span>
            </div>
            {report.parPersonne != null && (
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3">
                <span className="text-corps text-muted">Par personne</span>
                <span className="text-corps tabular-nums text-muted">
                  {formatEuro(Math.round(report.parPersonne))}
                </span>
              </div>
            )}
            <p className="mt-2 text-note text-muted">{fiabiliteLabel(report)}</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-note text-muted">Ce que ce document ne dit pas</h2>
        {report.manques.length === 0 ? (
          <p className="mt-2 text-corps text-muted">
            Rien ne manque à l’appel : chaque poste attendu porte un montant et son origine.
          </p>
        ) : (
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-corps text-muted">
            {report.manques.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-note text-muted">
          Aucun plan des pistes officiel n’est reproduit ici : ce sont des œuvres graphiques
          protégées.
        </p>
      </section>

      <div className="print:hidden">
        <button
          type="button"
          className="rounded-surface border border-line px-3 py-1.5 text-corps"
          onClick={() => window.print()}
        >
          Imprimer
        </button>
      </div>
    </article>
  );
}
