import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Course} from './course.model';
import {User} from './user.model';

@model({settings: {mongodb: {collection: 'sessions'}}})
export class Session extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @belongsTo(() => Course)
  courseId: string;

  @belongsTo(() => User)
  userId: string;

  @property({type: 'date', required: true})
  sessionDate: string;

  @property({type: 'number'})
  durationMinutes?: number;

  @property({type: 'string', default: 'scheduled'})
  status?: string;

  @property({type: 'string'})
  notes?: string;

  @property({type: 'string', default: 'live'})
  sessionType?: string;

  @property({type: 'string'})
  resourceUrl?: string;

  @property({type: 'string'})
  moduleId?: string;

  @property({type: 'boolean', default: false})
  attendanceRequired?: boolean;

  @property({type: 'string'})
  attendanceCode?: string;

  @property({type: 'number'})
  attendanceWindowMinutes?: number;

  @property({type: 'boolean', default: false})
  reminderEnabled?: boolean;

  @property({type: 'number'})
  reminderLeadMinutes?: number;

  @property({type: 'string'})
  reminderChannel?: string;

  @property({type: 'string'})
  reminderStatus?: string;

  @property({type: 'date'})
  lastReminderSentAt?: string;

  @property({type: 'number', default: 0})
  attendeeCount?: number;

  @property({type: 'number', default: 0})
  absenceCount?: number;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;
}

export interface SessionRelations { }

export type SessionWithRelations = Session & SessionRelations;
