/**
 * Template Method (functional)
 *
 * Skeleton is fixed in runTranslateAndPersist.
 * Varying steps are injected as plain functions.
 */

type Locale = 'uk' | 'en' | 'pl' | 'ru';

type TranslateBatchResult = {
  sourceLanguage: string;
  translations: Partial<Record<Locale, string>>;
};

const TARGET_LOCALES: Locale[] = ['uk', 'en', 'pl', 'ru'];

const computeSourceHash = (text: string): string => `hash:${text}`;

const translateText = async (
  text: string,
  targetLocales: Locale[],
): Promise<TranslateBatchResult> => {
  const translations: Partial<Record<Locale, string>> = {};

  for (const locale of targetLocales) {
    translations[locale] = `[${locale}] ${text}`;
  }

  return {
    sourceLanguage: 'uk',
    translations,
  };
};

// ---------------------------------------------------------------------------
// Steps contract = what subclasses used to override
// ---------------------------------------------------------------------------

type TranslationSteps<TEntity, TField extends string> = {
  isValidField: (field: string) => field is TField;
  loadSourceEntity: (id: string) => Promise<TEntity | null>;
  getSourceText: (entity: TEntity, field: TField) => string | null;
  translateAndPersist: (
    id: string,
    text: string,
    field: TField,
  ) => Promise<string | null>;
  updateForeignKey: (
    id: string,
    field: TField,
    translationId: string,
  ) => Promise<void>;
  computeHash?: (text: string) => string;
};

// ---------------------------------------------------------------------------
// TEMPLATE METHOD — fixed algorithm skeleton
// ---------------------------------------------------------------------------

const runTranslateAndPersist = async <TEntity, TField extends string>(
  steps: TranslationSteps<TEntity, TField>,
  id: string,
  field: string,
  text: string,
  expectedSourceHash: string,
): Promise<boolean> => {
  if (!steps.isValidField(field)) {
    return false;
  }

  const typedField = field;
  const trimmed = text.trim();

  if (trimmed === '') {
    return false;
  }

  const entity = await steps.loadSourceEntity(id);

  if (entity === null) {
    return false;
  }

  const currentSource = steps.getSourceText(entity, typedField)?.trim() ?? '';

  if (currentSource === '') {
    return false;
  }

  const hash = (steps.computeHash ?? computeSourceHash)(currentSource);

  if (hash !== expectedSourceHash) {
    return false;
  }

  const translationId = await steps.translateAndPersist(id, trimmed, typedField);

  if (translationId === null) {
    return false;
  }

  await steps.updateForeignKey(id, typedField, translationId);
  return true;
};

// ---------------------------------------------------------------------------
// Concrete steps — Project
// ---------------------------------------------------------------------------

type ProjectField = 'aboutObject' | 'constructionStages' | 'salesStatus';
type ProjectEntity = Record<ProjectField, string> & Record<string, string | null>;

const projectDb = new Map<string, ProjectEntity>([
  [
    'project-1',
    {
      aboutObject: 'Сучасний ЖК біля парку',
      constructionStages: 'Фундамент готовий',
      salesStatus: 'Відкриті продажі',
      aboutObjectId: null,
      constructionStagesId: null,
      salesStatusId: null,
    },
  ],
]);

const projectFk: Record<ProjectField, string> = {
  aboutObject: 'aboutObjectId',
  constructionStages: 'constructionStagesId',
  salesStatus: 'salesStatusId',
};

const projectSteps: TranslationSteps<ProjectEntity, ProjectField> = {
  isValidField: (field): field is ProjectField =>
    field === 'aboutObject' ||
    field === 'constructionStages' ||
    field === 'salesStatus',

  loadSourceEntity: async (id) => projectDb.get(id) ?? null,

  getSourceText: (entity, field) => entity[field],

  translateAndPersist: async (id, text, field) => {
    const result: TranslateBatchResult = await translateText(text, TARGET_LOCALES);
    const locales = Object.keys(result.translations) as Locale[];
    const en = result.translations.en ?? text;

    console.log(`[project] sourceLanguage=${result.sourceLanguage}, locales=${locales.join(',')}`);

    return `tr-project-${id}-${field}-${en.length}`;
  },

  updateForeignKey: async (id, field, translationId) => {
    const row = projectDb.get(id);

    if (row === undefined) {
      return;
    }

    row[projectFk[field]] = translationId;
  },
};

// ---------------------------------------------------------------------------
// Concrete steps — Financing
// ---------------------------------------------------------------------------

type FinancingField = 'title' | 'description';
type FinancingEntity = Record<FinancingField, string> & Record<string, string | null>;

const financingDb = new Map<string, FinancingEntity>([
  [
    'financing-1',
    {
      title: 'Розтермінування',
      description: 'Без відсотків',
      titleId: null,
      descriptionId: null,
    },
  ],
]);

const financingFk: Record<FinancingField, string> = {
  title: 'titleId',
  description: 'descriptionId',
};

const financingSteps: TranslationSteps<FinancingEntity, FinancingField> = {
  isValidField: (field): field is FinancingField =>
    field === 'title' || field === 'description',

  loadSourceEntity: async (id) => financingDb.get(id) ?? null,

  getSourceText: (entity, field) => entity[field],

  translateAndPersist: async (id, text, field) => {
    const result: TranslateBatchResult = await translateText(text, TARGET_LOCALES);
    const locales = Object.keys(result.translations) as Locale[];
    const en = result.translations.en ?? text;

    console.log(`[financing] sourceLanguage=${result.sourceLanguage}, locales=${locales.join(',')}`);

    return `tr-financing-${id}-${field}-${en.length}`;
  },

  updateForeignKey: async (id, field, translationId) => {
    const row = financingDb.get(id);

    if (row === undefined) {
      return;
    }

    row[financingFk[field]] = translationId;
  },
};

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const about = 'Сучасний ЖК біля парку';

  const okProject = await runTranslateAndPersist(
    projectSteps,
    'project-1',
    'aboutObject',
    about,
    computeSourceHash(about),
  );

  console.log('project ok:', okProject);
  console.log('project row:', projectDb.get('project-1'));

  const title = 'Розтермінування';

  const okFinancing = await runTranslateAndPersist(
    financingSteps,
    'financing-1',
    'title',
    title,
    computeSourceHash(title),
  );

  console.log('financing ok:', okFinancing);
  console.log('financing row:', financingDb.get('financing-1'));
};

main();