import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Course} from './course.model';
import {Tenant} from './tenant.model';
import {User} from './user.model';

@model({settings: {mongodb: {collection: 'certificates'}}})
export class Certificate extends Entity {
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

  @property({type: 'date', defaultFn: 'now'})
  issueDate?: string;

  @property({type: 'string'})
  certificateUrl?: string;
}

export interface CertificateRelations { }

export type CertificateWithRelations = Certificate & CertificateRelations;
