import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  juggler,
  repository,
} from '@loopback/repository';
import {Assignment, Submission, SubmissionRelations, User} from '../models';
import type {AssignmentRepository} from './assignment.repository';
import type {UserRepository} from './user.repository';

export class SubmissionRepository extends DefaultCrudRepository<
  Submission,
  typeof Submission.prototype.id,
  SubmissionRelations
> {
  public readonly assignment: BelongsToAccessor<
    Assignment,
    typeof Submission.prototype.id
  >;
  public readonly user: BelongsToAccessor<
    User,
    typeof Submission.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('AssignmentRepository')
    protected assignmentRepositoryGetter: Getter<AssignmentRepository>,
    @repository.getter('UserRepository')
    protected userRepositoryGetter: Getter<UserRepository>,
  ) {
    super(Submission, dataSource);

    this.assignment = this.createBelongsToAccessorFor(
      'assignment',
      this.assignmentRepositoryGetter,
    );
    this.registerInclusionResolver(
      'assignment',
      this.assignment.inclusionResolver,
    );

    this.user = this.createBelongsToAccessorFor(
      'user',
      this.userRepositoryGetter,
    );
    this.registerInclusionResolver('user', this.user.inclusionResolver);
  }
}
