import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import ar from "./locales/ar.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", dir: "ltr" as const },
  { code: "ar", label: "العربية", dir: "rtl" as const },
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const RTL_LANGS = new Set(["ar", "fa", "prs", "ps", "ur"]);

export function dirFor(lang: string): "ltr" | "rtl" {
  return RTL_LANGS.has(lang.split("-")[0]) ? "rtl" : "ltr";
}

let initialized = false;

export function initI18n() {
  if (initialized) return i18n;
  initialized = true;

  const instance = i18n.use(initReactI18next);
  if (typeof window !== "undefined") {
    instance.use(LanguageDetector);
  }

  instance.init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    lng: typeof window === "undefined" ? "en" : undefined,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "casemap.lang",
    },
  });

  return i18n;
}

export default i18n;