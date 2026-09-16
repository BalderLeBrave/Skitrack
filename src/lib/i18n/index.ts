import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STRINGS, type Locale, type MsgId } from "./catalog";

export type { Locale, MsgId };

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

/** Hors rendu : un toast, un verrou de navigation. Lit la langue en cours au
 *  moment de l'appel, là où `useT` la lit au rendu. */
export function dire(id: MsgId): string {
  return t(id, useLocale.getState().locale);
}

export function useT(): (id: MsgId) => string {
  const locale = useLocale((s) => s.locale);
  return (id) => t(id, locale);
}
