import {belongsTo, Entity, model, property} from '@loopback/repository';
import {AttachmentMetadata, AttachmentMetadataSchema} from './attachment.model';
import {Module} from './module.model';

@model({settings: {mongodb: {collection: 'chapters'}}})
export class Chapter extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @property({type: 'string', required: true})
  title: string;

  @property({type: 'string'})
  summary?: string;

  @property({type: 'string'})
  contentType?: string;

  @property({type: 'string'})
  contentUrl?: string;

  @property({type: 'number'})
  durationMinutes?: number;

  @belongsTo(() => Module)
  moduleId: string;

  @property({
    type: 'array',
    itemType: 'object',
    jsonSchema: {
      type: 'array',
      items: AttachmentMetadataSchema as object,
    },
  })
  attachments?: AttachmentMetadata[];

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;
}

export interface ChapterRelations { }

export type ChapterWithRelations = Chapter & ChapterRelations;
