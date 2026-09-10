import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STRINGS, type Locale, type MsgId } from "./catalog";

type I18nStore = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useLocale = create<I18nStore>()(
  persist(
    (set) => ({
      locale: "fr",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "skitrack-locale" },
  ),
);

export function t(id: MsgId, locale: Locale = "fr"): string {
  return STRINGS[locale][id] ?? STRINGS.fr[id] ?? id;
}

export function useT(): (id: MsgId) => string {
  const locale = useLocale((s) => s.locale);
  return (id) => t(id, locale);
}
