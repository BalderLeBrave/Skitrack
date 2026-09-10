import { Link } from "@tanstack/react-router";
import { SkiinfoCard } from "@/components/SkiinfoCard";
import { pinKindLabel, stationFiche } from "@/lib/fiche";
import { useSkiinfoLive } from "@/lib/skiinfoLive";
import { formatKm, PISTE_HEX } from "@/lib/pistes";
import { formatAlt, type Station } from "@/lib/stations";

function gps(lat: number, lon: number): string {
  return `${lat.toFixed(4)}° N · ${lon.toFixed(4)}° E`;
}

export function FicheDetail({ station }: { station: Station }) {
  const live = useSkiinfoLive((s) => s.rows[station.id]);
  const f = stationFiche(station, live);
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="fiche-detail">
      <p className="text-xs uppercase tracking-wide text-muted">Fiche détaillée</p>
      <div className="mt-2">
        <SkiinfoCard stationId={station.id} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Village</dt>
          <dd className="tabular-nums">{formatAlt(f.villageM)}</dd>
        </div>
        <div>
          <dt className="text-muted">Base</dt>
          <dd className="tabular-nums">{formatAlt(f.minM)}</dd>
        </div>
        <div>
          <dt className="text-muted">Sommet</dt>
          <dd className="tabular-nums">{formatAlt(f.maxM)}</dd>
        </div>
        <div>
          <dt className="text-muted">Dénivelé</dt>
          <dd className="tabular-nums">{formatAlt(f.dropM)}</dd>
        </div>
        <div>
          <dt className="text-muted">IGN au pin</dt>
          <dd className="tabular-nums">{f.demM != null ? formatAlt(f.demM) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Pin</dt>
          <dd>{pinKindLabel(f.pinKind)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <dt className="text-muted">GPS</dt>
          <dd className="tabular-nums">{gps(f.lat, f.lon)}</dd>
        </div>
      </dl>

      <h3 className="mt-5 text-xs uppercase tracking-wide text-muted">Mix Skiinfo ({f.grain})</h3>
      {f.hasMix ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[18rem] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-3 font-medium">Couleur</th>
                <th className="pb-2 pr-3 font-medium">Pistes</th>
                <th className="pb-2 pr-3 font-medium">%</th>
                <th className="pb-2 font-medium">km</th>
              </tr>
            </thead>
            <tbody>
              {f.mix.map((row) => (
                <tr key={row.color} className="border-t border-line">
                  <td className="py-1.5 pr-3">
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: PISTE_HEX[row.color] }}
                    />
                    {row.label}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{row.n}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{row.pct} %</td>
                  <td className="py-1.5 tabular-nums">{f.km != null && f.km > 0 ? `${formatKm(row.km)} km` : "—"}</td>
                </tr>
              ))}
              <tr className="border-t border-line font-medium">
                <td className="py-1.5 pr-3">Total</td>
                <td className="py-1.5 pr-3 tabular-nums">{f.n}</td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {f.mix.reduce((n, r) => n + r.pct, 0)} %
                </td>
                <td className="py-1.5 tabular-nums">{f.km != null ? `${formatKm(f.km)} km` : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Mix non publié sur cette fiche Skiinfo.</p>
      )}
      <p className="mt-2 text-sm text-muted">
        {f.longestKm != null ? `Piste la plus longue : ${formatKm(f.longestKm)} km (témoin, pas une somme). ` : ""}
        Les km par couleur sont alloués au km total publié, Skiinfo ne les donne pas.
      </p>

      {(f.domainName || f.passLine || f.glacier) && (
        <>
          <h3 className="mt-5 text-xs uppercase tracking-wide text-muted">Domaine / forfait</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {f.domainName ? <li>Catalogue : {f.domainName}</li> : null}
            {f.domainKm != null ? <li>Km catalogue : {f.domainKm} km</li> : null}
            {f.domainLifts != null ? <li>Remontées catalogue : {f.domainLifts}</li> : null}
            {f.glacier ? <li>Glacier : déclaré au catalogue</li> : null}
            {f.passLine ? <li>{f.passLine}</li> : null}
            {f.website ? (
              <li>
                <a href={f.website} className="underline-offset-2 hover:underline" rel="noreferrer">
                  Site du domaine
                </a>
              </li>
            ) : null}
          </ul>
        </>
      )}

      <h3 className="mt-5 text-xs uppercase tracking-wide text-muted">Sources</h3>
      <ul className="mt-2 space-y-1 text-sm text-muted">
        <li>
          Skiinfo · {f.skiinfoAt}
          {f.skiinfoUrl ? (
            <>
              {" "}
              ·{" "}
              <a href={f.skiinfoUrl} className="text-ink underline-offset-2 hover:underline" rel="noreferrer">
                plans des pistes
              </a>
            </>
          ) : null}
        </li>
        <li>IGN RGE ALTI au pin GPS</li>
        {f.fmId != null ? <li>France Montagnes id {f.fmId} (village)</li> : null}
        <li>
          <Link to="/carte" className="text-ink underline-offset-2 hover:underline">
            Carte France
          </Link>
        </li>
      </ul>
    </section>
  );
}
