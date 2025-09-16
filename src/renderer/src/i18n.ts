import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '../locales/en.json'
import ru from '../locales/ru.json'
import uk from '../locales/uk.json'

export const defaultNS = 'ns'

i18n.use(initReactI18next).init({
  resources: {
    en: {
      ns: en
    },
    ru: {
      ns: ru
    },
    uk: {
      ns: uk
    }
  },
  defaultNS,
  fallbackLng: 'en'
})

export default i18n
