import {Entity, hasMany, model, property} from '@loopback/repository';
import {Certificate} from './certificate.model';
import {CmsContent} from './cms-content.model';
import {Course} from './course.model';
import {Order} from './order.model';
import {User} from './user.model';

@model({settings: {mongodb: {collection: 'tenants'}}})
export class Tenant extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @property({type: 'string', required: true})
  name: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[a-z0-9_-]+$'
    },
  })
  slug: string;

  @property({type: 'string'})
  logoUrl?: string;

  @property({type: 'string'})
  domain?: string;

  @property({type: 'array', itemType: 'string'})
  hostnames?: string[];

  @property({type: 'string', default: 'standard'})
  planType?: string;

  @property({type: 'string', default: 'active'})
  status?: string;

  @property({type: 'string'})
  primaryContactName?: string;

  @property({type: 'string'})
  primaryContactEmail?: string;

  @property({type: 'string'})
  supportEmail?: string;

  @property({type: 'string'})
  supportPhone?: string;

  @property({type: 'string'})
  defaultLocale?: string;

  @property({type: 'string'})
  defaultTimezone?: string;

  @property({type: 'object'})
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };

  @property({type: 'object'})
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    logoLightUrl?: string;
    logoDarkUrl?: string;
  };

  @property({type: 'object'})
  billingSettings?: {
    legalName?: string;
    taxId?: string;
    payoutCurrency?: string;
    payoutSchedule?: 'weekly' | 'monthly' | 'manual';
  };

  @property({type: 'object'})
  dropboxConfig?: {
    appKey?: string;
    appSecret?: string;
    refreshToken?: string;
    rootPath?: string;
    status?: 'pending' | 'connected' | 'error';
    connectedAt?: string;
    lastSyncedAt?: string;
  };

  @property({type: 'number', default: 10})
  maxInstructors?: number;

  @property({type: 'number', default: 50})
  maxCourses?: number;

  @property({type: 'object'})
  settings?: Record<string, unknown>;

  @property({type: 'date'})
  suspendedAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;

  @hasMany(() => User)
  users?: User[];

  @hasMany(() => Course)
  courses?: Course[];

  @hasMany(() => Order)
  orders?: Order[];

  @hasMany(() => Certificate)
  certificates?: Certificate[];

  @hasMany(() => CmsContent)
  cmsContents?: CmsContent[];
}

export interface TenantRelations { }

export type TenantWithRelations = Tenant & TenantRelations;
