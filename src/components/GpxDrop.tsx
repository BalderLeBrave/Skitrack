import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import { useTrack } from "@/lib/track";

const MAX_BYTES = 8 * 1024 * 1024;

export function GpxDrop() {
  const loadText = useTrack((s) => s.loadText);
  const error = useTrack((s) => s.error);
  const [over, setOver] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const take = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (file.size > MAX_BYTES) {
        setLocalErr("Fichier trop lourd (8 Mo max).");
        return;
      }
      const text = await file.text();
      setLocalErr(null);
      loadText(text, file.name);
    },
    [loadText],
  );

  return (
    <label
      className={`gpx-drop${over ? " gpx-drop--over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void take(e.dataTransfer.files[0]);
      }}
    >
      <Upload className="size-5" aria-hidden />
      <span>
        <strong>Déposez un GPX</strong>
        <span className="block text-sm text-muted">ou cliquez pour choisir un fichier. Lat / lon / altitude lus dans le fichier — rien n’est inventé.</span>
      </span>
      <input
        type="file"
        accept=".gpx,application/gpx+xml,text/xml"
        className="sr-only"
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {localErr || error ? <p className="gpx-drop__err">{localErr ?? error}</p> : null}
    </label>
  );
}
