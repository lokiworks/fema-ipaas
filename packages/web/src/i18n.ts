import { LocalesEnum } from '@fema-ipaas/core-utils';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';

export const i18nReady = i18n
  .use(ICU)
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: LocalesEnum.CHINESE_SIMPLIFIED,
    debug: false,
    detection: {
      order: ['querystring', 'localStorage'],
      lookupQuerystring: 'lng',
      lookupLocalStorage: 'fema.language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    supportedLngs: Object.values(LocalesEnum),
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
  });
export default i18n;
