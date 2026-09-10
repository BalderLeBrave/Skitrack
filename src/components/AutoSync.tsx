import { useEffect, useState } from "react";
import { tickAutoSync } from "@/lib/autoSync.api";
import { useT } from "@/lib/i18n";

const PAUSE_MS = 15 * 60 * 1000;
const TICK_GAP_MS = 400;

export function AutoSync() {
  const t = useT();
  const [running, setRunning] = useState(true);

  useEffect(() => {
    let stop = false;
    let pause: ReturnType<typeof setTimeout> | undefined;

    async function pulse() {
      setRunning(true);
      while (!stop) {
        try {
          const tick = await tickAutoSync({ data: {} });
          if (stop) return;
          if (tick.idle) {
            setRunning(false);
            pause = setTimeout(() => {
              if (!stop) void pulse();
            }, PAUSE_MS);
            return;
          }
        } catch {
          if (stop) return;
          setRunning(false);
          pause = setTimeout(() => {
            if (!stop) void pulse();
          }, PAUSE_MS);
          return;
        }
        await new Promise((r) => setTimeout(r, TICK_GAP_MS));
      }
    }

    void pulse();
    return () => {
      stop = true;
      if (pause) clearTimeout(pause);
    };
  }, []);

  return (
    <span className="hidden shrink-0 text-xs text-muted lg:inline" data-testid="auto-sync" data-running={running}>
      {running ? t("sync.running") : t("sync.idle")}
    </span>
  );
}
