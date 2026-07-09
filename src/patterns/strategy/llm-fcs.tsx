/**
 * Strategy (functional) — LLM translation
 *
 * Strategy  = a function with a shared signature
 * Context   = translateField (uses whatever strategy you pass)
 * Concrete  = openAiStrategy / deepLStrategy / mockStrategy
 */

type Locale = 'uk' | 'en' | 'pl' | 'ru';

type TranslateBatchParams = {
  text: string;
  targetLocales: Locale[];
  context: { entityType: string; fieldType: string };
};

type TranslateBatchResult = {
  sourceLanguage: string;
  translations: Partial<Record<Locale, string>>;
};

// Strategy = function type (no classes)
type TranslationStrategy = (
  params: TranslateBatchParams,
) => Promise<TranslateBatchResult>;

// ---------------------------------------------------------------------------
// Concrete strategies
// ---------------------------------------------------------------------------

const openAiStrategy: TranslationStrategy = async (params) => {
  // Real project: call OpenAI here
  return {
    sourceLanguage: 'uk',
    translations: {
      en: `[OpenAI en] ${params.text}`,
      pl: `[OpenAI pl] ${params.text}`,
    },
  };
};

const deepLStrategy: TranslationStrategy = async (params) => {
  return {
    sourceLanguage: 'uk',
    translations: {
      en: `[DeepL en] ${params.text}`,
    },
  };
};

const mockStrategy: TranslationStrategy = async (params) => {
  return {
    sourceLanguage: 'und',
    translations: Object.fromEntries(
      params.targetLocales.map((locale) => [locale, `mock-${locale}`]),
    ),
  };
};

// ---------------------------------------------------------------------------
// Context — fixed flow, algorithm is injected
// ---------------------------------------------------------------------------

const translateField = async (
  text: string,
  entityType: string,
  fieldType: string,
  strategy: TranslationStrategy, // <-- injected strategy
): Promise<TranslateBatchResult> => {
  const trimmed = text.trim();

  if (trimmed === '') {
    return { sourceLanguage: 'und', translations: {} };
  }

  // Context does not know which provider this is
  return strategy({
    text: trimmed,
    targetLocales: ['uk', 'en', 'pl', 'ru'],
    context: { entityType, fieldType },
  });
};

// ---------------------------------------------------------------------------
// Client chooses strategy
// ---------------------------------------------------------------------------

await translateField(
  'Сучасний житловий комплекс',
  'project',
  'aboutObject',
  openAiStrategy,
);

await translateField(
  'Сучасний житловий комплекс',
  'project',
  'aboutObject',
  deepLStrategy, // swap algorithm
);

await translateField('Hello', 'financing', 'title', mockStrategy);