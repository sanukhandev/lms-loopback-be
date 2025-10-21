import {belongsTo, Entity, hasMany, model, property} from '@loopback/repository';
import {Assignment} from './assignment.model';
import {Certificate} from './certificate.model';
import {Enrollment} from './enrollment.model';
import {Module} from './module.model';
import {Order} from './order.model';
import {Session} from './session.model';
import {Tenant} from './tenant.model';
import {User} from './user.model';

@model({settings: {mongodb: {collection: 'courses'}}})
export class Course extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @property({type: 'string', required: true})
  title: string;

  @property({type: 'string'})
  description?: string;

  @property({type: 'string'})
  category?: string;

  @property({type: 'number'})
  price?: number;

  @property({type: 'number'})
  salePrice?: number;

  @property({type: 'number'})
  platformFee?: number;

  @property({type: 'boolean', default: false})
  published?: boolean;

  @property({type: 'string', default: 'draft'})
  status?: string;

  @property({type: 'date'})
  startDate?: string;

  @property({type: 'date'})
  endDate?: string;

  @belongsTo(() => Tenant)
  tenantId: string;

  @belongsTo(() => User, {name: 'instructor'})
  instructorId: string;

  @hasMany(() => Assignment)
  assignments?: Assignment[];

  @hasMany(() => Enrollment)
  enrollments?: Enrollment[];

  @hasMany(() => Module)
  modules?: Module[];

  @hasMany(() => Certificate)
  certificates?: Certificate[];

  @hasMany(() => Session)
  sessions?: Session[];

  @hasMany(() => Order)
  orders?: Order[];

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;
}

export interface CourseRelations { }

export type CourseWithRelations = Course & CourseRelations;
