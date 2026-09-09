import { readFileSync } from 'fs';
import path from 'path';

import i18n from 'i18next';
import ICU from 'i18next-icu';

const translation = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../public/locales/en/translation.json'),
    'utf-8',
  ),
);

await i18n.use(ICU).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation } },
  interpolation: { escapeValue: false },
  keySeparator: false,
  nsSeparator: false,
  returnEmptyString: false,
});
