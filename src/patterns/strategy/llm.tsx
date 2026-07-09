/**
 * Strategy pattern — LLM translation
 *
 * Context  = LlmTranslationService   (does not know HOW we translate)
 * Strategy = TranslationProvider     (common algorithm interface)
 * Concrete = OpenAiTranslationProvider (one way to translate)
 *
 * Later you can add DeepLTranslationProvider / MockTranslationProvider
 * and swap them without changing the context.
 */

// ---------------------------------------------------------------------------
// 1. Shared types (request / response of the algorithm)
// ---------------------------------------------------------------------------

type Locale = 'uk' | 'en' | 'pl' | 'ru';

type TranslateBatchParams = {
  text: string;
  targetLocales: Locale[];
  context: {
    entityType: string;
    fieldType: string;
  };
};

type TranslateBatchResult = {
  sourceLanguage: string;
  translations: Partial<Record<Locale, string>>;
};

// ---------------------------------------------------------------------------
// 2. Strategy interface — common contract for all algorithms
// ---------------------------------------------------------------------------

interface TranslationProvider {
  translateBatch(params: TranslateBatchParams): Promise<TranslateBatchResult>;
}

// ---------------------------------------------------------------------------
// 3. Concrete strategies — different ways to do the SAME job
// ---------------------------------------------------------------------------

class OpenAiTranslationProvider implements TranslationProvider {
  async translateBatch(params: TranslateBatchParams): Promise<TranslateBatchResult> {
    // Real project: call OpenAI, parse JSON, restore placeholders, etc.
    console.log(`[OpenAI] translating "${params.text}"`);

    return {
      sourceLanguage: 'uk',
      translations: {
        en: `[en] ${params.text}`,
        pl: `[pl] ${params.text}`,
        ru: `[ru] ${params.text}`,
      },
    };
  }
}

class DeepLTranslationProvider implements TranslationProvider {
  async translateBatch(params: TranslateBatchParams): Promise<TranslateBatchResult> {
    // Another algorithm, same interface
    console.log(`[DeepL] translating "${params.text}"`);

    return {
      sourceLanguage: 'uk',
      translations: {
        en: `DeepL: ${params.text}`,
      },
    };
  }
}

class MockTranslationProvider implements TranslationProvider {
  async translateBatch(params: TranslateBatchParams): Promise<TranslateBatchResult> {
    // Useful in tests — no real API calls
    return {
      sourceLanguage: 'und',
      translations: Object.fromEntries(
        params.targetLocales.map((locale) => [locale, `mock-${locale}`]),
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Context — owns business flow, delegates the algorithm to a strategy
// ---------------------------------------------------------------------------

class LlmTranslationService {
	private provider: TranslationProvider;
  constructor(
	provider: TranslationProvider
) {
	this.provider = provider;
  }

  // Hot-swap strategy at runtime (optional, classic Strategy API)
  setProvider(provider: TranslationProvider): void {
    this.provider = provider;
  }

  async translateField(text: string, entityType: string, fieldType: string) {
    const trimmed = text.trim();

    if (trimmed === '') {
      return { sourceLanguage: 'und', translations: {} };
    }

    // Context does NOT care if this is OpenAI, DeepL, or Mock.
    // It only knows the Strategy interface.
    const result = await this.provider.translateBatch({
      text: trimmed,
      targetLocales: ['uk', 'en', 'pl', 'ru'],
      context: { entityType, fieldType },
    });

    // Here you could also: restore placeholders, same-locale fallback, validate...
    return result;
  }
}

// ---------------------------------------------------------------------------
// 5. Client — chooses which strategy to inject
// ---------------------------------------------------------------------------

async function main() {
  // Production: OpenAI strategy
  const service = new LlmTranslationService(new OpenAiTranslationProvider());

  const first = await service.translateField(
    'Сучасний житловий комплекс',
    'project',
    'aboutObject',
  );
  console.log(first);

  // Swap algorithm on the fly — context code stays the same
  service.setProvider(new DeepLTranslationProvider());

  const second = await service.translateField(
    'Сучасний житловий комплекс',
    'project',
    'aboutObject',
  );
  console.log(second);

  // Tests: mock strategy
  service.setProvider(new MockTranslationProvider());
  const third = await service.translateField('Hello', 'financing', 'title');
  console.log(third);
}

main();