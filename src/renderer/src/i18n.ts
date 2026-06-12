import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '../locales/en.json'

export const defaultNS = 'ns'

const localeLoaders: Record<string, () => Promise<{ default: unknown }>> = {
  ru: () => import('../locales/ru.json'),
  uk: () => import('../locales/uk.json')
}

i18n.use(initReactI18next).init({
  resources: {
    en: {
      ns: en
    }
  },
  defaultNS,
  fallbackLng: 'en'
})

export async function changeAppLanguage(lang: string): Promise<void> {
  const loadLocale = localeLoaders[lang]
  if (loadLocale && !i18n.hasResourceBundle(lang, defaultNS)) {
    try {
      const data = (await loadLocale()).default
      i18n.addResourceBundle(lang, defaultNS, data)
    } catch {
    }
  }

  await i18n.changeLanguage(lang)
}

export default i18n
