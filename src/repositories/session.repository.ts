import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  juggler,
  repository,
} from '@loopback/repository';
import {Course, Session, SessionRelations, User} from '../models';
import type {CourseRepository} from './course.repository';
import type {UserRepository} from './user.repository';

export class SessionRepository extends DefaultCrudRepository<
  Session,
  typeof Session.prototype.id,
  SessionRelations
> {
  public readonly course: BelongsToAccessor<
    Course,
    typeof Session.prototype.id
  >;
  public readonly user: BelongsToAccessor<
    User,
    typeof Session.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('CourseRepository')
    protected courseRepositoryGetter: Getter<CourseRepository>,
    @repository.getter('UserRepository')
    protected userRepositoryGetter: Getter<UserRepository>,
  ) {
    super(Session, dataSource);

    this.course = this.createBelongsToAccessorFor(
      'course',
      this.courseRepositoryGetter,
    );
    this.registerInclusionResolver('course', this.course.inclusionResolver);

    this.user = this.createBelongsToAccessorFor(
      'user',
      this.userRepositoryGetter,
    );
    this.registerInclusionResolver('user', this.user.inclusionResolver);
  }
}
