/** `div.toast#toast` (l. 454) et `toast()` (l. 467) : 2 200 ms, hors `.app`. */

import { useEffect, useState } from "react";
import { useParcours } from "@/lib/parcours";

export function Toast() {
  const toast = useParcours((s) => s.toast);
  const [show, setShow] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!toast) return;
    setText(toast.text);
    setShow(true);
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className={`v6-toast${show ? " show" : ""}`} id="toast">
      {text}
    </div>
  );
}
