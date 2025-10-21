import {belongsTo, Entity, hasMany, model, property} from '@loopback/repository';
import {Certificate} from './certificate.model';
import {Course} from './course.model';
import {Enrollment} from './enrollment.model';
import {Order} from './order.model';
import {Session} from './session.model';
import {Submission} from './submission.model';
import {Tenant} from './tenant.model';

@model({settings: {mongodb: {collection: 'users'}}})
export class User extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      transform: ['toLowerCase'],
      pattern: '^[^@\s]+@[^@\s]+\.[^@\s]+$',
    },
  })
  email: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      minLength: 8,
    },
  })
  password: string;

  @property({type: 'string', required: true})
  firstName: string;

  @property({type: 'string', required: true})
  lastName: string;

  @property({type: 'string'})
  avatarUrl?: string;

  @property({type: 'string'})
  phoneNumber?: string;

  @property({type: 'string'})
  jobTitle?: string;

  @property({type: 'string'})
  bio?: string;

  @property({type: 'string'})
  timezone?: string;

  @property({type: 'string'})
  locale?: string;

  @property({type: 'object'})
  socialLinks?: {
    website?: string;
    linkedin?: string;
    twitter?: string;
    youtube?: string;
    facebook?: string;
    instagram?: string;
  };

  @property({type: 'object'})
  notificationPreferences?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  };

  @property({type: 'boolean', default: true})
  marketingOptIn?: boolean;

  @property({type: 'date'})
  lastLoginAt?: string;

  @property({type: 'date'})
  lastPasswordChangedAt?: string;

  @property({
    type: 'array',
    itemType: 'string',
    default: ['student'],
  })
  roles?: string[];

  @property({type: 'string', default: 'active'})
  status?: string;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;

  @belongsTo(() => Tenant)
  tenantId: string;

  @hasMany(() => Course, {keyTo: 'instructorId'})
  teaching?: Course[];

  @hasMany(() => Enrollment, {keyTo: 'learnerId'})
  enrollments?: Enrollment[];

  @hasMany(() => Submission)
  submissions?: Submission[];

  @hasMany(() => Order)
  orders?: Order[];

  @hasMany(() => Certificate)
  certificates?: Certificate[];

  @hasMany(() => Session)
  sessions?: Session[];
}

export interface UserRelations { }

export type UserWithRelations = User & UserRelations;
