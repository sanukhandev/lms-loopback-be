import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Course} from './course.model';
import {Tenant} from './tenant.model';
import {User} from './user.model';

@model({settings: {mongodb: {collection: 'orders'}}})
export class Order extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @belongsTo(() => Tenant)
  tenantId: string;

  @belongsTo(() => User)
  userId: string;

  @belongsTo(() => Course)
  courseId: string;

  @property({type: 'number', required: true})
  totalAmount: number;

  @property({type: 'number', required: true})
  platformFee: number;

  @property({type: 'number', required: true})
  netAmount: number;

  @property({type: 'string', required: true})
  currency: string;

  @property({type: 'string', default: 'pending'})
  paymentStatus?: string;

  @property({type: 'string', default: 'stripe'})
  paymentGateway?: string;

  @property({type: 'string'})
  reference?: string;

  @property({type: 'object'})
  breakdown?: Record<string, unknown>;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;
}

export interface OrderRelations { }

export type OrderWithRelations = Order & OrderRelations;
