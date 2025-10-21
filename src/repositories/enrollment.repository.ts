import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  juggler,
  repository,
} from '@loopback/repository';
import {Course, Enrollment, EnrollmentRelations, User} from '../models';
import {CourseRepository} from './course.repository';
import {UserRepository} from './user.repository';

export class EnrollmentRepository extends DefaultCrudRepository<
  Enrollment,
  typeof Enrollment.prototype.id,
  EnrollmentRelations
> {
  public readonly course: BelongsToAccessor<
    Course,
    typeof Enrollment.prototype.id
  >;
  public readonly learner: BelongsToAccessor<
    User,
    typeof Enrollment.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('CourseRepository')
    protected courseRepositoryGetter: Getter<CourseRepository>,
    @repository.getter('UserRepository')
    protected userRepositoryGetter: Getter<UserRepository>,
  ) {
    super(Enrollment, dataSource);

    this.course = this.createBelongsToAccessorFor(
      'course',
      this.courseRepositoryGetter,
    );
    this.registerInclusionResolver(
      'course',
      this.course.inclusionResolver,
    );

    this.learner = this.createBelongsToAccessorFor(
      'learner',
      this.userRepositoryGetter,
    );
    this.registerInclusionResolver(
      'learner',
      this.learner.inclusionResolver,
    );
  }
}
