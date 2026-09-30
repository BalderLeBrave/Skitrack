import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Apercu } from "./webcamApercu";

/** L'aperçu d'une webcam : sa dernière image, lue chez l'exploitant. Jamais d'erreur : `image: null`. */
export const getApercuWebcam = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url().max(300) }))
  .handler(async ({ data }): Promise<Apercu> => {
    const { apercuWebcam } = await import("./webcamApercu.server");
    try {
      return await apercuWebcam(data.url);
    } catch (e) {
      console.warn(`[webcam] aperçu illisible : ${data.url} (${e instanceof Error ? e.message : String(e)})`);
      return { image: null, prise: null };
    }
  });
