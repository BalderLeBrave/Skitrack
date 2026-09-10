import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlpineMap } from "@/components/AlpineMap";
import { AppShell } from "@/components/AppShell";
import { mapFilter, type MapFilter } from "@/lib/alpine";
import { STATIONS } from "@/lib/stations";

export const Route = createFileRoute("/carte")({ component: Carte });

function Carte() {
  const [filter, setFilter] = useState<MapFilter>("all");
  const stations = useMemo(() => mapFilter(STATIONS, filter), [filter]);
  const n = (id: MapFilter) => mapFilter(STATIONS, id).length;
  return (
    <AppShell
      chips={
        <>
          {(
            [
              ["all", `France · ${n("all")}`],
              ["nord", `Alpes Nord · ${n("nord")}`],
              ["sud", `Alpes Sud · ${n("sud")}`],
              ["pyrenees", `Pyrénées · ${n("pyrenees")}`],
              ["jura", `Jura · ${n("jura")}`],
              ["vosges", `Vosges · ${n("vosges")}`],
              ["central", `Massif central · ${n("central")}`],
              ["corse", `Corse · ${n("corse")}`],
              ["haut", `≥ 3000 m · ${n("haut")}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`shrink-0 rounded-full px-3 py-1 text-sm ${filter === id ? "bg-glacier font-semibold" : "text-muted"}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </>
      }
    >
      <AlpineMap stations={stations} filter={filter} />
    </AppShell>
  );
}
