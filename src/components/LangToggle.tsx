import { useLocale } from "@/lib/i18n";

export function LangToggle({ light = false }: { light?: boolean }) {
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const cls = light
    ? "rounded-full border border-white/35 bg-ink/30 px-3 py-1 text-white"
    : "shrink-0 rounded-full border border-line px-3 py-1.5 text-sm";
  return (
    <button
      type="button"
      className={cls}
      onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
      aria-label={locale === "fr" ? "English" : "Français"}
    >
      {locale === "fr" ? "FR" : "EN"}
    </button>
  );
}
