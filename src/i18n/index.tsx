import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import en, { type TranslationMap } from "./en";
import zh from "./zh";
import type { LocaleCode } from "../types/call";

const locales: Record<LocaleCode, TranslationMap> = { en, zh };

type Flatten<T, P extends string = ""> = T extends object
  ? { [K in keyof T]: Flatten<T[K], P extends "" ? `${K & string}` : `${P}.${K & string}`> }[keyof T]
  : P;

export type TranslationKey = Flatten<TranslationMap>;

interface I18nContextValue {
  locale: LocaleCode;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  t: (key) => key,
});

function resolve(obj: unknown, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

export const I18nProvider: React.FC<{ locale: LocaleCode; children: ReactNode }> = ({
  locale,
  children,
}) => {
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t: (key: string) => resolve(locales[locale] ?? en, key),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
