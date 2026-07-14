import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildTranslationPromptContext } from '@modules/llm-translation/helpers/build-translation-prompt-context.helper';
import { EntityFieldTranslationService } from '@modules/llm-translation/services/entity-field-translation.service';
import { LlmTranslationPersistenceService } from '@modules/llm-translation/services/llm-translation-persistence.service';
import { LlmTranslationService } from '@modules/llm-translation/services/llm-translation.service';
import {
  TranslationEntityType,
  TranslationPromptContext,
} from '@modules/llm-translation/translation.types';
import {
  FINANCING_FIELD_TO_FK_COLUMN,
  FINANCING_TRANSLATION_PROFILE,
  FinancingTranslationFieldType,
} from '@modules/financing/constants/financing-translation.constants';
import FinancingEntity from '@modules/financing/entities/financing.entity';

type FinancingSourceFields = Pick<FinancingEntity, 'title' | 'description'>;

@Injectable()
export class FinancingTranslationService extends EntityFieldTranslationService<
  FinancingSourceFields,
  FinancingTranslationFieldType
> {
  protected readonly logger = new Logger(FinancingTranslationService.name);
  protected readonly entityType = TranslationEntityType.Financing;

  constructor(
    llmTranslation: LlmTranslationService,
    llmTranslationPersistence: LlmTranslationPersistenceService,
    @InjectRepository(FinancingEntity)
    private readonly financingRepository: Repository<FinancingEntity>,
  ) {
    super(llmTranslation, llmTranslationPersistence);
  }

  protected isValidField(field: string): field is FinancingTranslationFieldType {
    return Object.values(FinancingTranslationFieldType).includes(
      field as FinancingTranslationFieldType,
    );
  }

  protected async loadSourceEntity(id: string): Promise<FinancingSourceFields | null> {
    const financing = await this.financingRepository.findOne({
      where: { id },
      select: ['title', 'description'],
    });

    return financing ?? null;
  }

  protected getSourceText(
    entity: FinancingSourceFields,
    field: FinancingTranslationFieldType,
  ): string | null {
    return entity[field];
  }

  protected getFkColumn(field: FinancingTranslationFieldType): string | null {
    return FINANCING_FIELD_TO_FK_COLUMN[field];
  }

  protected async updateForeignKey(
    id: string,
    fkColumn: string,
    translationId: string,
  ): Promise<void> {
    await this.financingRepository.update(id, { [fkColumn]: translationId });
  }

  protected buildPrompt(field: FinancingTranslationFieldType): TranslationPromptContext {
    return buildTranslationPromptContext(FINANCING_TRANSLATION_PROFILE, field);
  }
}
