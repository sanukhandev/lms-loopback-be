import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Session} from './session.model';
import {User} from './user.model';

@model({settings: {mongodb: {collection: 'session_attendance'}}})
export class SessionAttendance extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: true,
  })
  id?: string;

  @belongsTo(() => Session)
  sessionId: string;

  @belongsTo(() => User)
  userId: string;

  @property({type: 'string', default: 'pending'})
  status?: string;

  @property({type: 'date'})
  joinedAt?: string;

  @property({type: 'date'})
  leftAt?: string;

  @property({type: 'string'})
  notes?: string;

  @property({type: 'string'})
  recordedBy?: string;

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;
}

export interface SessionAttendanceRelations { }

export type SessionAttendanceWithRelations = SessionAttendance & SessionAttendanceRelations;
