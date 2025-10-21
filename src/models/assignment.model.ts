import {belongsTo, Entity, hasMany, model, property} from '@loopback/repository';
import {Course} from './course.model';
import {Submission} from './submission.model';

@model({settings: {mongodb: {collection: 'assignments'}}})
export class Assignment extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @property({type: 'string', required: true})
  title: string;

  @property({type: 'string'})
  instructions?: string;

  @property({type: 'date'})
  dueDate?: string;

  @property({type: 'number', default: 100})
  maxScore?: number;

  @belongsTo(() => Course)
  courseId: string;

  @hasMany(() => Submission)
  submissions?: Submission[];

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;
}

export interface AssignmentRelations { }

export type AssignmentWithRelations = Assignment & AssignmentRelations;
