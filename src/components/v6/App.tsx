/** `div.app` de la maquette (l. 196–453) : `header.nav`, `main`, puis le
 *  bandeau hors coquille (l. 454). Chaque route rend sa `section.screen.on`
 *  dans `main` ; `scrollTop` est remis à zéro à chaque changement d'écran
 *  (l. 492). Le lien de partage (l. 751–752) est lu une fois au montage. */

import { useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useGo } from "./go";
import { Nav } from "./Nav";
import { Toast } from "./Toast";
import { useParcours } from "@/lib/parcours";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";

let hashRead = false;

export function V6App({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const go = useGo();

  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>(".v6 .screen.on .scroll")
      .forEach((s) => (s.scrollTop = 0));
  }, [pathname]);

  // l. 751–752 : `#s=<station>&l=<logement>&n=<nuits>&t=<voyageurs>&r=<chambres>`.
  useEffect(() => {
    if (hashRead) return;
    hashRead = true;
    const h = new URLSearchParams(window.location.hash.slice(1));
    const s = h.get("s");
    if (!s || !stationById(s)) return;
    const p = useParcours.getState();
    const st = useStay.getState();
    p.retain(s);
    const n = +(h.get("n") ?? 0),
      t = +(h.get("t") ?? 0),
      r = +(h.get("r") ?? 0);
    const patch: Partial<{ guests: number; bedrooms: number; checkOut: string }> = {};
    if (t) patch.guests = t;
    if (r) patch.bedrooms = r;
    if (n) {
      const [y, m, d] = st.checkIn.split("-").map(Number);
      const out = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
      patch.checkOut = out.toISOString().slice(0, 10);
    }
    if (Object.keys(patch).length) st.setStay(patch);
    const l = h.get("l");
    if (l) p.chooseLodge(l);
    window.history.replaceState(null, "", window.location.pathname);
    void go(l ? "booking" : "lodging");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="v6 app">
        <Nav />
        <main>{children}</main>
      </div>
      <Toast />
    </>
  );
}
