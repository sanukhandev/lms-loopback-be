import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  juggler,
  repository,
} from '@loopback/repository';
import {Assignment, AssignmentRelations, Course, Submission} from '../models';
import {CourseRepository} from './course.repository';
import type {SubmissionRepository} from './submission.repository';

export class AssignmentRepository extends DefaultCrudRepository<
  Assignment,
  typeof Assignment.prototype.id,
  AssignmentRelations
> {
  public readonly course: BelongsToAccessor<
    Course,
    typeof Assignment.prototype.id
  >;
  public readonly submissions: HasManyRepositoryFactory<
    Submission,
    typeof Assignment.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('CourseRepository')
    protected courseRepositoryGetter: Getter<CourseRepository>,
    @repository.getter('SubmissionRepository')
    protected submissionRepositoryGetter: Getter<SubmissionRepository>,
  ) {
    super(Assignment, dataSource);

    this.course = this.createBelongsToAccessorFor(
      'course',
      this.courseRepositoryGetter,
    );
    this.registerInclusionResolver(
      'course',
      this.course.inclusionResolver,
    );

    this.submissions = this.createHasManyRepositoryFactoryFor(
      'submissions',
      this.submissionRepositoryGetter,
    );
    this.registerInclusionResolver(
      'submissions',
      this.submissions.inclusionResolver,
    );
  }
}
