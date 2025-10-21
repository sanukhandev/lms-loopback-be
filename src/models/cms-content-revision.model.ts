import {belongsTo, Entity, model, property} from '@loopback/repository';
import {CmsContent} from './cms-content.model';
import {Tenant} from './tenant.model';

@model({settings: {mongodb: {collection: 'cms_content_revisions'}}})
export class CmsContentRevision extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @belongsTo(() => CmsContent)
  cmsContentId: string;

  @belongsTo(() => Tenant)
  tenantId: string;

  @property({type: 'number', required: true})
  version: number;

  @property({type: 'object', required: true})
  snapshot: Record<string, unknown>;

  @property({type: 'string'})
  createdBy?: string;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;
}

export interface CmsContentRevisionRelations { }

export type CmsContentRevisionWithRelations = CmsContentRevision & CmsContentRevisionRelations;
