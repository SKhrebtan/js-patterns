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
  DISCOUNT_ITEM_FIELD_TO_FK_COLUMN,
  DISCOUNT_ITEM_TRANSLATION_PROFILE,
  DiscountItemTranslationFieldType,
} from '@modules/discounts/constants/discount-item-translation.constants';
import DiscountItemEntity from '@modules/discounts/entities/discount-item.entity';

type DiscountItemSourceFields = Pick<DiscountItemEntity, 'title' | 'description'>;

@Injectable()
export class DiscountItemTranslationService extends EntityFieldTranslationService<
  DiscountItemSourceFields,
  DiscountItemTranslationFieldType
> {
  protected readonly logger = new Logger(DiscountItemTranslationService.name);
  protected readonly entityType = TranslationEntityType.DiscountItem;

  constructor(
    llmTranslation: LlmTranslationService,
    llmTranslationPersistence: LlmTranslationPersistenceService,
    @InjectRepository(DiscountItemEntity)
    private readonly discountItemRepository: Repository<DiscountItemEntity>,
  ) {
    super(llmTranslation, llmTranslationPersistence);
  }

  protected isValidField(field: string): field is DiscountItemTranslationFieldType {
    return Object.values(DiscountItemTranslationFieldType).includes(
      field as DiscountItemTranslationFieldType,
    );
  }

  protected async loadSourceEntity(id: string): Promise<DiscountItemSourceFields | null> {
    const item = await this.discountItemRepository.findOne({
      where: { id },
      select: ['title', 'description'],
    });

    return item ?? null;
  }

  protected getSourceText(
    entity: DiscountItemSourceFields,
    field: DiscountItemTranslationFieldType,
  ): string | null {
    return entity[field];
  }

  protected getFkColumn(field: DiscountItemTranslationFieldType): string | null {
    return DISCOUNT_ITEM_FIELD_TO_FK_COLUMN[field];
  }

  protected async updateForeignKey(
    id: string,
    fkColumn: string,
    translationId: string,
  ): Promise<void> {
    await this.discountItemRepository.update(id, { [fkColumn]: translationId });
  }

  protected buildPrompt(field: DiscountItemTranslationFieldType): TranslationPromptContext {
    return buildTranslationPromptContext(DISCOUNT_ITEM_TRANSLATION_PROFILE, field);
  }
}
