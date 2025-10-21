import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  juggler,
  repository,
} from '@loopback/repository';
import {Chapter, Course, Module, ModuleRelations} from '../models';
import {ChapterRepository} from './chapter.repository';
import type {CourseRepository} from './course.repository';

export class ModuleRepository extends DefaultCrudRepository<
  Module,
  typeof Module.prototype.id,
  ModuleRelations
> {
  public readonly chapters: HasManyRepositoryFactory<
    Chapter,
    typeof Module.prototype.id
  >;
  public readonly course: BelongsToAccessor<
    Course,
    typeof Module.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('ChapterRepository')
    protected chapterRepositoryGetter: Getter<ChapterRepository>,
    @repository.getter('CourseRepository')
    protected courseRepositoryGetter: Getter<CourseRepository>,
  ) {
    super(Module, dataSource);

    this.chapters = this.createHasManyRepositoryFactoryFor(
      'chapters',
      this.chapterRepositoryGetter,
    );
    this.registerInclusionResolver(
      'chapters',
      this.chapters.inclusionResolver,
    );

    this.course = this.createBelongsToAccessorFor(
      'course',
      this.courseRepositoryGetter,
    );
    this.registerInclusionResolver('course', this.course.inclusionResolver);
  }
}
