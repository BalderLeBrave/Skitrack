import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { ThemeSync } from "@/lib/theme";
import appCss from "../styles.css?url";
import v6Css from "../design/v6.css?url";

const APP_NAME = "Skitrack";

/** Lu dans `<head>`, avant la première peinture. Le nom du stockage est celui
 *  de `useTheme` (`skitrack-theme`) ; un stockage refusé laisse le thème clair,
 *  qui est la valeur par défaut du magasin. */
const THEME_AVANT_PEINTURE = `try{var t=JSON.parse(localStorage.getItem("skitrack-theme")||"{}");t=t&&t.state&&t.state.theme;if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}else{document.documentElement.setAttribute("data-theme","light");}}catch(e){document.documentElement.setAttribute("data-theme","light");}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Logements au ski : dates, personnes, chambres. Prix ferme du séjour.",
      },
      { name: "theme-color", content: "#16191e" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: v6Css },
      // Le manifeste et l'icône d'écran d'accueil ne sont pas déclarés ici :
      // `scripts/grok-pwa-shared.mjs` les pose quand `public/__grok/` existe,
      // c'est-à-dire dans le bac à sable Grok. Ailleurs, git ignore ce dossier
      // et les deux liens renverraient une 404.
      // Manrope est embarquée (`src/design/manrope.css`, `public/fonts/`) :
      // l'application tourne hors ligne, et la mesure au pixel ne dépend plus
      // d'un aller-retour réseau. Les deux preconnect vers Google et les deux
      // sous-ensembles qu'ils servaient ne sont plus nécessaires.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/manrope-latin.woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  component: () => (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Le thème est posé avant la première peinture.
         *
         *  L'attribut valait « light » en dur : qui avait choisi le sombre
         *  recevait une page claire, corrigée seulement après l'hydratation —
         *  un éclair blanc à chaque chargement. Ce script lit le même stockage
         *  que `useTheme` et écrit l'attribut avant que le document ne
         *  s'affiche ; `ThemeSync` prend la suite pour les bascules à chaud. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_AVANT_PEINTURE }} />
      </head>
      <body>
        <PreviewHostBridge />
        <ThemeSync />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
