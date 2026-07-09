/**
 * Template Method — entity field translation (full learning example)
 *
 * Abstract class owns the skeleton.
 * Subclasses override only the varying steps.
 */

// ---------------------------------------------------------------------------
// Shared domain stubs (simplified from the real project)
// ---------------------------------------------------------------------------

type Locale = 'uk' | 'en' | 'pl' | 'ru';

enum TranslationEntityType {
  Project = 'project',
  Financing = 'financing',
}

type TranslateBatchResult = {
  sourceLanguage: string;
  translations: Partial<Record<Locale, string>>;
};

function computeSourceHash(text: string): string {
  // stub — in real code this is the shared helper
  return `hash:${text}`;
}

// Fake LLM + persistence (enough for the pattern demo)
const llmTranslation = {
  async translateField(params: {
    text: string;
    fieldType: string;
    entityType: TranslationEntityType;
  }): Promise<TranslateBatchResult> {
    return {
      sourceLanguage: 'uk',
      translations: {
        en: `[en] ${params.text}`,
        pl: `[pl] ${params.text}`,
      },
    };
  },
};

const llmTranslationPersistence = {
  async findIdBySourceHash(
  key: { instanceType: TranslationEntityType; instanceId: string; field: string },
  sourceHash: string,
): Promise<string | null> {
  console.log('findIdBySourceHash', key, sourceHash); // optional
  return null;
},

  async upsert(params: {
    instanceType: TranslationEntityType;
    instanceId: string;
    field: string;
    result: TranslateBatchResult;
    sourceHash: string;
  }): Promise<{ id: string } | null> {
    return { id: `tr-${params.instanceType}-${params.field}` };
  },
};

// ---------------------------------------------------------------------------
// Entity-specific field enums / maps
// ---------------------------------------------------------------------------

enum ProjectTranslationFieldType {
  AboutObject = 'aboutObject',
  ConstructionStages = 'constructionStages',
  SalesStatus = 'salesStatus',
}

enum FinancingTranslationFieldType {
  Title = 'title',
  Description = 'description',
}

const PROJECT_FIELD_TO_FK_COLUMN: Record<ProjectTranslationFieldType, string> = {
  [ProjectTranslationFieldType.AboutObject]: 'aboutObjectId',
  [ProjectTranslationFieldType.ConstructionStages]: 'constructionStagesId',
  [ProjectTranslationFieldType.SalesStatus]: 'salesStatusId',
};

const FINANCING_FIELD_TO_FK_COLUMN: Record<FinancingTranslationFieldType, string> = {
  [FinancingTranslationFieldType.Title]: 'titleId',
  [FinancingTranslationFieldType.Description]: 'descriptionId',
};

type ProjectSourceFields = {
  aboutObject: string;
  constructionStages: string;
  salesStatus: string;
};

type FinancingSourceFields = {
  title: string;
  description: string;
};

// In-memory "DB" for the demo
const projectDb = new Map<string, ProjectSourceFields & Record<string, string | null>>([
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

const financingDb = new Map<string, FinancingSourceFields & Record<string, string | null>>([
  [
    'financing-1',
    {
      title: 'Розтермінування',
      description: 'Без відсотків на 12 місяців',
      titleId: null,
      descriptionId: null,
    },
  ],
]);

// ---------------------------------------------------------------------------
// Abstract class = Template Method owner
// ---------------------------------------------------------------------------

abstract class EntityTranslationService<TEntity, TField extends string> {
  /**
   * TEMPLATE METHOD
   * Subclasses must NOT override this.
   * It fixes the algorithm order; only steps below vary.
   */
  async translateAndPersistSingleField(
    id: string,
    field: string,
    text: string,
    expectedSourceHash: string,
  ): Promise<boolean> {
    if (!this.isValidField(field)) {
      return false;
    }

    const typedField = field as TField;
    const trimmed = text.trim();

    if (trimmed === '') {
      return false;
    }

    const entity = await this.loadSourceEntity(id);

    if (entity === null) {
      return false;
    }

    const currentSource = this.getSourceText(entity, typedField)?.trim() ?? '';

    if (currentSource === '') {
      return false;
    }

    if (this.computeHash(currentSource) !== expectedSourceHash) {
      return false;
    }

    const translationId = await this.translateAndPersist(id, trimmed, typedField);

    if (translationId === null) {
      return false;
    }

    await this.updateForeignKey(id, typedField, translationId);
    return true;
  }

  // --- abstract steps (must be implemented by subclasses) ---

  protected abstract isValidField(field: string): field is TField;

  protected abstract loadSourceEntity(id: string): Promise<TEntity | null>;

  protected abstract getSourceText(entity: TEntity, field: TField): string | null;

  protected abstract translateAndPersist(
    id: string,
    text: string,
    field: TField,
  ): Promise<string | null>;

  protected abstract updateForeignKey(
    id: string,
    field: TField,
    translationId: string,
  ): Promise<void>;

  // --- shared step with default implementation (hook-like) ---

  protected computeHash(text: string): string {
    return computeSourceHash(text);
  }

  // Shared helper used by concrete classes
  protected async translateViaLlm(
    text: string,
    field: TField,
    entityType: TranslationEntityType,
  ): Promise<TranslateBatchResult> {
    return llmTranslation.translateField({
      text,
      fieldType: field,
      entityType,
    });
  }

  protected async persistTranslation(
    id: string,
    field: TField,
    text: string,
    entityType: TranslationEntityType,
  ): Promise<string | null> {
    const sourceHash = this.computeHash(text);

    const existingId = await llmTranslationPersistence.findIdBySourceHash(
      { instanceType: entityType, instanceId: id, field },
      sourceHash,
    );

    if (existingId !== null) {
      return existingId;
    }

    const result = await this.translateViaLlm(text, field, entityType);
    const saved = await llmTranslationPersistence.upsert({
      instanceType: entityType,
      instanceId: id,
      field,
      result,
      sourceHash,
    });

    return saved?.id ?? null;
  }
}

// ---------------------------------------------------------------------------
// Concrete class 1 — Project
// ---------------------------------------------------------------------------

class ProjectTranslationService extends EntityTranslationService<
  ProjectSourceFields,
  ProjectTranslationFieldType
> {
  protected isValidField(field: string): field is ProjectTranslationFieldType {
    return Object.values(ProjectTranslationFieldType).includes(
      field as ProjectTranslationFieldType,
    );
  }

  protected async loadSourceEntity(id: string): Promise<ProjectSourceFields | null> {
    return projectDb.get(id) ?? null;
  }

  protected getSourceText(
    entity: ProjectSourceFields,
    field: ProjectTranslationFieldType,
  ): string | null {
    return entity[field];
  }

  protected async translateAndPersist(
    id: string,
    text: string,
    field: ProjectTranslationFieldType,
  ): Promise<string | null> {
    return this.persistTranslation(id, field, text, TranslationEntityType.Project);
  }

  protected async updateForeignKey(
    id: string,
    field: ProjectTranslationFieldType,
    translationId: string,
  ): Promise<void> {
    const row = projectDb.get(id);

    if (row === undefined) {
      return;
    }

    const fkColumn = PROJECT_FIELD_TO_FK_COLUMN[field];
    row[fkColumn] = translationId;
  }
}

// ---------------------------------------------------------------------------
// Concrete class 2 — Financing
// ---------------------------------------------------------------------------

class FinancingTranslationService extends EntityTranslationService<
  FinancingSourceFields,
  FinancingTranslationFieldType
> {
  protected isValidField(field: string): field is FinancingTranslationFieldType {
    return Object.values(FinancingTranslationFieldType).includes(
      field as FinancingTranslationFieldType,
    );
  }

  protected async loadSourceEntity(id: string): Promise<FinancingSourceFields | null> {
    return financingDb.get(id) ?? null;
  }

  protected getSourceText(
    entity: FinancingSourceFields,
    field: FinancingTranslationFieldType,
  ): string | null {
    return entity[field];
  }

  protected async translateAndPersist(
    id: string,
    text: string,
    field: FinancingTranslationFieldType,
  ): Promise<string | null> {
    return this.persistTranslation(id, field, text, TranslationEntityType.Financing);
  }

  protected async updateForeignKey(
    id: string,
    field: FinancingTranslationFieldType,
    translationId: string,
  ): Promise<void> {
    const row = financingDb.get(id);

    if (row === undefined) {
      return;
    }

    const fkColumn = FINANCING_FIELD_TO_FK_COLUMN[field];
    row[fkColumn] = translationId;
  }
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const projectService = new ProjectTranslationService();
  const financingService = new FinancingTranslationService();

  const aboutObject = 'Сучасний ЖК біля парку';
  const okProject = await projectService.translateAndPersistSingleField(
    'project-1',
    ProjectTranslationFieldType.AboutObject,
    aboutObject,
    computeSourceHash(aboutObject),
  );

  console.log('project ok:', okProject);
  console.log('project row:', projectDb.get('project-1'));

  const title = 'Розтермінування';
  const okFinancing = await financingService.translateAndPersistSingleField(
    'financing-1',
    FinancingTranslationFieldType.Title,
    title,
    computeSourceHash(title),
  );

  console.log('financing ok:', okFinancing);
  console.log('financing row:', financingDb.get('financing-1'));
}

main();