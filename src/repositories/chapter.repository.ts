import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  juggler,
  repository,
} from '@loopback/repository';
import {Chapter, ChapterRelations, Module} from '../models';
import type {ModuleRepository} from './module.repository';

export class ChapterRepository extends DefaultCrudRepository<
  Chapter,
  typeof Chapter.prototype.id,
  ChapterRelations
> {
  public readonly module: BelongsToAccessor<
    Module,
    typeof Chapter.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('ModuleRepository')
    protected moduleRepositoryGetter: Getter<ModuleRepository>,
  ) {
    super(Chapter, dataSource);

    this.module = this.createBelongsToAccessorFor(
      'module',
      this.moduleRepositoryGetter,
    );
    this.registerInclusionResolver('module', this.module.inclusionResolver);
  }
}
