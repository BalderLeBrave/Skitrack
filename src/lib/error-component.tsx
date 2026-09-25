import type { ErrorComponentProps } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-bg text-ink"
      }
    >
      <span className="text-piste-rouge" aria-hidden="true">
        <Icon name="alerte" className="size-10" />
      </span>
      <h1 className="text-lg font-semibold">Cette page n’a pas pu s’afficher</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {error.message || "Erreur inattendue. Rechargez la page."}
      </p>
    </main>
  );
}
