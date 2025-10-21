import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Assignment} from './assignment.model';
import {User} from './user.model';

@model({settings: {mongodb: {collection: 'submissions'}}})
export class Submission extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @belongsTo(() => Assignment)
  assignmentId: string;

  @belongsTo(() => User)
  userId: string;

  @property({type: 'date', defaultFn: 'now'})
  submittedAt?: string;

  @property({type: 'number'})
  grade?: number;

  @property({type: 'string'})
  feedback?: string;

  @property({type: 'array', itemType: 'string'})
  attachments?: string[];
}

export interface SubmissionRelations { }

export type SubmissionWithRelations = Submission & SubmissionRelations;
