import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { tr } from "@/lib/i18n";

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
      <h1 className="text-lg font-semibold">{tr("Cette page n’a pas pu s’afficher")}</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {error.message || tr("Erreur inattendue. Rechargez la page.")}
      </p>
    </main>
  );
}

/**
 * Une adresse qui ne mène à aucun écran. Sans elle, TanStack Router affichait
 * « Not Found » en anglais, sur une page nue, et prévenait dans la console à
 * chaque adresse inconnue.
 */
export function AppNotFoundComponent() {
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-bg text-ink"
      }
    >
      <span className="text-muted" aria-hidden="true">
        <Icon name="montagne" className="size-10" />
      </span>
      <h1 className="text-lg font-semibold">{tr("Page introuvable")}</h1>
      <p className="max-w-md text-sm text-muted">{tr("Cette adresse ne mène à aucun écran de Skitrack.")}</p>
      <Link to="/" className="btn7">
        {tr("Retour à l’accueil")}
      </Link>
    </main>
  );
}
