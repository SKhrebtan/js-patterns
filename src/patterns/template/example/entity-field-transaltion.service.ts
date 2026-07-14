import { Logger } from '@nestjs/common';
import { computeSourceHash } from '@modules/llm-translation/helpers/compute-source-hash.helper';
import { LlmTranslationPersistenceService } from '@modules/llm-translation/services/llm-translation-persistence.service';
import { LlmTranslationService } from '@modules/llm-translation/services/llm-translation.service';
import {
  TranslationEntityType,
  TranslationPromptContext,
} from '@modules/llm-translation/translation.types';

export abstract class EntityFieldTranslationService<TEntity, TField extends string> {
  protected abstract readonly logger: Logger;
  protected abstract readonly entityType: TranslationEntityType;

  constructor(
    protected readonly llmTranslation: LlmTranslationService,
    protected readonly llmTranslationPersistence: LlmTranslationPersistenceService,
  ) {}

  async translateAndPersistSingleField(
    id: string,
    field: string,
    text: string,
    expectedSourceHash: string,
  ): Promise<boolean> {
    if (!this.isValidField(field)) {
      this.logger.warn(`Skip unknown ${this.entityType} translation field: ${field}`);
      return false;
    }

    const trimmed = text.trim();

    if (trimmed === '') {
      return false;
    }

    const entity = await this.loadSourceEntity(id);

    if (entity === null) {
      return false;
    }

    const currentSource = this.getSourceText(entity, field)?.trim() ?? '';

    if (currentSource === '') {
      this.logger.log(`Skip stale translation: empty source for ${id} field=${field}`);
      return false;
    }

    const currentHash = computeSourceHash(currentSource);

    if (currentHash !== expectedSourceHash) {
      this.logger.log(`Skip stale translation: hash mismatch for ${id} field=${field}`);
      return false;
    }

    const translationId = await this.translateAndPersistField(id, trimmed, field);

    if (translationId === null) {
      return false;
    }

    const fkColumn = this.getFkColumn(field);

    if (fkColumn === null) {
      return false;
    }

    await this.updateForeignKey(id, fkColumn, translationId);
    return true;
  }

  protected abstract isValidField(field: string): field is TField;

  protected abstract loadSourceEntity(id: string): Promise<TEntity | null>;

  protected abstract getSourceText(entity: TEntity, field: TField): string | null;

  protected abstract getFkColumn(field: TField): string | null;

  protected abstract updateForeignKey(
    id: string,
    fkColumn: string,
    translationId: string,
  ): Promise<void>;

  protected abstract buildPrompt(field: TField): TranslationPromptContext;

  protected async translateAndPersistField(
    id: string,
    text: string,
    field: TField,
  ): Promise<string | null> {
    const trimmed = text.trim();

    if (trimmed === '') {
      return null;
    }

    const instanceType = this.entityType;
    const sourceHash = computeSourceHash(trimmed);

    const existingId = await this.llmTranslationPersistence.findIdBySourceHash(
      { instanceType, instanceId: id, field },
      sourceHash,
    );

    if (existingId !== null) {
      this.logger.log(`Skip LLM: unchanged source for ${instanceType}/${id} field=${field}`);
      return existingId;
    }

    const result = await this.llmTranslation.translateField({
      text: trimmed,
      fieldType: field,
      entityType: instanceType,
      prompt: this.buildPrompt(field),
    });

    const saved = await this.llmTranslationPersistence.upsert({
      instanceType,
      instanceId: id,
      field,
      result,
      sourceHash,
    });

    return saved?.id ?? null;
  }
}
