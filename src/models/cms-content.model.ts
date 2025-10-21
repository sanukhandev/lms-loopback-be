import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Tenant} from './tenant.model';

@model({settings: {mongodb: {collection: 'cms_contents'}}})
export class CmsContent extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @belongsTo(() => Tenant)
  tenantId: string;

  @property({type: 'string', required: true})
  section: string;

  @property({type: 'string', required: true})
  blockType: string;

  @property({type: 'string'})
  slug?: string;

  @property({type: 'string', default: 'en'})
  locale?: string;

  @property({type: 'string', default: 'draft'})
  status?: string;

  @property({type: 'string'})
  title?: string;

  @property({type: 'string'})
  body?: string;

  @property({type: 'string'})
  imageUrl?: string;

  @property({type: 'string'})
  excerpt?: string;

  @property({type: 'array', itemType: 'string'})
  tags?: string[];

  @property({type: 'number', default: 0})
  order?: number;

  @property({type: 'object'})
  metadata?: Record<string, unknown>;

  @property({type: 'string'})
  seoTitle?: string;

  @property({type: 'string'})
  seoDescription?: string;

  @property({type: 'date'})
  publishAt?: string;

  @property({type: 'date'})
  unpublishAt?: string;

  @property({type: 'date'})
  publishedAt?: string;

  @property({type: 'string'})
  publishedBy?: string;

  @property({type: 'number', default: 1})
  version?: number;

  @property({type: 'boolean', default: true})
  isPublic?: boolean;

  @property({type: 'string'})
  previewToken?: string;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;
}

export interface CmsContentRelations { }

export type CmsContentWithRelations = CmsContent & CmsContentRelations;
