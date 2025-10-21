import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Course} from './course.model';
import {User} from './user.model';

@model({settings: {mongodb: {collection: 'enrollments'}}})
export class Enrollment extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @belongsTo(() => Course)
  courseId: string;

  @belongsTo(() => User, {name: 'learner'})
  learnerId: string;

  @property({type: 'string', default: 'student'})
  role?: string;

  @property({type: 'string', default: 'active'})
  status?: string;

  @property({type: 'number'})
  progressPercentage?: number;

  @property({type: 'date', defaultFn: 'now'})
  enrolledAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;
}

export interface EnrollmentRelations { }

export type EnrollmentWithRelations = Enrollment & EnrollmentRelations;
