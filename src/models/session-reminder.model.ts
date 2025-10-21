import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Session} from './session.model';

@model({settings: {mongodb: {collection: 'session_reminders'}}})
export class SessionReminder extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @belongsTo(() => Session)
  sessionId: string;

  @property({type: 'string', default: 'email'})
  channel?: string;

  @property({type: 'date', required: true})
  sendAt: string;

  @property({type: 'string', default: 'pending'})
  status?: string;

  @property({type: 'number', default: 0})
  attemptCount?: number;

  @property({type: 'date'})
  lastAttemptAt?: string;

  @property({type: 'string'})
  lastError?: string;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;
}

export interface SessionReminderRelations { }

export type SessionReminderWithRelations = SessionReminder & SessionReminderRelations;
