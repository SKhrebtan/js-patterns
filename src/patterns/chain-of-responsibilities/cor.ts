type Locale = 'uk' | 'en' | 'ru';

// Single link contract: string = handled, null = pass to the next handler
type TextResolver = (
  source: string,
  fieldTexts: Partial<Record<Locale, string>> | undefined,
  locale: Locale,
) => string | null;

// Link 1: try to take the translation
const fromTranslation: TextResolver = (_source, fieldTexts, locale) => {
  const value = fieldTexts?.[locale]?.trim();

  if (value !== undefined && value !== '') {
    return value;
  }

  return null;
};

// Link 2: if nobody matched — return the original
const fromSource: TextResolver = (source) => source;

// Chain builder: takes a list of functions and returns one function
function chain(...handlers: TextResolver[]): TextResolver {
  return (source, fieldTexts, locale) => {
    for (const handler of handlers) {
      const result = handler(source, fieldTexts, locale);

      if (result !== null) {
        return result;
      }
    }

    return source;
  };
}

// Ready chain: translation first, then source
const resolveFieldLocaleText = chain(fromTranslation, fromSource);

// Usage
resolveFieldLocaleText(
  'Hello',
  { uk: 'Привіт', en: 'Hello' },
  'uk',
);
// → 'Привіт'

resolveFieldLocaleText('Hello', undefined, 'uk');
// → 'Hello'