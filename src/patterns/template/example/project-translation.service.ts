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
  PROJECT_FIELD_TO_FK_COLUMN,
  PROJECT_TRANSLATION_PROFILE,
  ProjectTranslationFieldType,
} from '@modules/projects/constants/project-translation.constants';
import ProjectEntity from '@modules/projects/entities/project.entity';

type ProjectSourceFields = Pick<ProjectEntity, 'aboutObject' | 'constructionStages' | 'salesStatus'>;

@Injectable()
export class ProjectTranslationService extends EntityFieldTranslationService<
  ProjectSourceFields,
  ProjectTranslationFieldType
> {
  protected readonly logger = new Logger(ProjectTranslationService.name);
  protected readonly entityType = TranslationEntityType.Project;

  constructor(
    llmTranslation: LlmTranslationService,
    llmTranslationPersistence: LlmTranslationPersistenceService,
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
  ) {
    super(llmTranslation, llmTranslationPersistence);
  }

  protected isValidField(field: string): field is ProjectTranslationFieldType {
    return Object.values(ProjectTranslationFieldType).includes(field as ProjectTranslationFieldType);
  }

  protected async loadSourceEntity(id: string): Promise<ProjectSourceFields | null> {
    const project = await this.projectRepository.findOne({
      where: { id },
      select: ['aboutObject', 'constructionStages', 'salesStatus'],
    });

    return project ?? null;
  }

  protected getSourceText(
    entity: ProjectSourceFields,
    field: ProjectTranslationFieldType,
  ): string | null {
    if (field === ProjectTranslationFieldType.AboutObject) {
      return entity.aboutObject;
    }

    if (field === ProjectTranslationFieldType.ConstructionStages) {
      return entity.constructionStages;
    }

    if (field === ProjectTranslationFieldType.SalesStatus) {
      return entity.salesStatus;
    }

    return null;
  }

  protected getFkColumn(field: ProjectTranslationFieldType): string | null {
    const fkColumn = PROJECT_FIELD_TO_FK_COLUMN[field];

    if (fkColumn === null || fkColumn === undefined) {
      return null;
    }

    return fkColumn;
  }

  protected async updateForeignKey(
    id: string,
    fkColumn: string,
    translationId: string,
  ): Promise<void> {
    await this.projectRepository.update(id, { [fkColumn]: translationId });
  }

  protected buildPrompt(field: ProjectTranslationFieldType): TranslationPromptContext {
    return buildTranslationPromptContext(PROJECT_TRANSLATION_PROFILE, field);
  }
}
