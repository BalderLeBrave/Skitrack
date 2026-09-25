import type { CallToolResult } from "./types.ts";
import { isLoginRequired } from "./login.ts";

export type CallToolErrorKind =
  | "login"
  | "not_connected"
  | "scope_denied"
  | "access_denied"
  | "error";

export type CallToolErrorState = {
  kind: CallToolErrorKind;
  message: string;
  detail?: string;
};

export function classifyCallToolError(
  result: CallToolResult,
): CallToolErrorState | null {
  if (result.ok) return null;
  const detail = result.errorMessage || undefined;
  const raw = (result.errorMessage ?? "").toLowerCase();
  if (isLoginRequired(result)) {
    return {
      kind: "login",
      message: "Connectez-vous avec Grok pour charger vos données.",
      detail,
    };
  }
  if (raw.includes("not_connected") || raw.includes("failed_precondition")) {
    return {
      kind: "not_connected",
      message: "Activez ce connecteur dans Grok pour charger vos données.",
      detail,
    };
  }
  if (raw.includes("scope_denied")) {
    return {
      kind: "scope_denied",
      message: "Cette vue n’est pas disponible : l’application a demandé un outil hors de ses autorisations.",
      detail,
    };
  }
  if (raw.includes("access_denied")) {
    return {
      kind: "access_denied",
      message: "Vous n’avez pas accès à ces données.",
      detail,
    };
  }
  return {
    kind: "error",
    message: detail ?? "La requête a échoué. Réessayez.",
    detail,
  };
}
