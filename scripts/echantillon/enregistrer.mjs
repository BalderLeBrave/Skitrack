// `node --import ./scripts/echantillon/enregistrer.mjs` : branche le résolveur.
import { register } from "node:module";

register(new URL("./resolveur.mjs", import.meta.url).href);
