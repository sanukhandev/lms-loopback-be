import {belongsTo, Entity, hasMany, model, property} from '@loopback/repository';
import {Chapter} from './chapter.model';
import {Course} from './course.model';

@model({settings: {mongodb: {collection: 'modules'}}})
export class Module extends Entity {
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

  @property({type: 'number'})
  ordering?: number;

  @belongsTo(() => Course)
  courseId: string;

  @hasMany(() => Chapter)
  chapters?: Chapter[];

  @property({type: 'date', defaultFn: 'now'})
  createdAt?: string;

  @property({type: 'date', defaultFn: 'now'})
  updatedAt?: string;
}

export interface ModuleRelations { }

export type ModuleWithRelations = Module & ModuleRelations;
