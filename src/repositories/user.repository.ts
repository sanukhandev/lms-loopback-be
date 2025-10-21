import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  juggler,
  repository,
} from '@loopback/repository';
import {
  Certificate,
  Course,
  Enrollment,
  Order,
  Session,
  Submission,
  Tenant,
  User,
  UserRelations,
} from '../models';
import type {CertificateRepository} from './certificate.repository';
import {CourseRepository} from './course.repository';
import {EnrollmentRepository} from './enrollment.repository';
import type {OrderRepository} from './order.repository';
import type {SessionRepository} from './session.repository';
import type {SubmissionRepository} from './submission.repository';
import type {TenantRepository} from './tenant.repository';

export class UserRepository extends DefaultCrudRepository<
  User,
  typeof User.prototype.id,
  UserRelations
> {
  public readonly teaching: HasManyRepositoryFactory<
    Course,
    typeof User.prototype.id
  >;
  public readonly enrollments: HasManyRepositoryFactory<
    Enrollment,
    typeof User.prototype.id
  >;
  public readonly submissions: HasManyRepositoryFactory<
    Submission,
    typeof User.prototype.id
  >;
  public readonly orders: HasManyRepositoryFactory<
    Order,
    typeof User.prototype.id
  >;
  public readonly certificates: HasManyRepositoryFactory<
    Certificate,
    typeof User.prototype.id
  >;
  public readonly sessions: HasManyRepositoryFactory<
    Session,
    typeof User.prototype.id
  >;
  public readonly tenant: BelongsToAccessor<
    Tenant,
    typeof User.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('CourseRepository')
    protected courseRepositoryGetter: Getter<CourseRepository>,
    @repository.getter('EnrollmentRepository')
    protected enrollmentRepositoryGetter: Getter<EnrollmentRepository>,
    @repository.getter('SubmissionRepository')
    protected submissionRepositoryGetter: Getter<SubmissionRepository>,
    @repository.getter('OrderRepository')
    protected orderRepositoryGetter: Getter<OrderRepository>,
    @repository.getter('CertificateRepository')
    protected certificateRepositoryGetter: Getter<CertificateRepository>,
    @repository.getter('SessionRepository')
    protected sessionRepositoryGetter: Getter<SessionRepository>,
    @repository.getter('TenantRepository')
    protected tenantRepositoryGetter: Getter<TenantRepository>,
  ) {
    super(User, dataSource);

    this.teaching = this.createHasManyRepositoryFactoryFor(
      'teaching',
      this.courseRepositoryGetter,
    );
    this.registerInclusionResolver(
      'teaching',
      this.teaching.inclusionResolver,
    );

    this.enrollments = this.createHasManyRepositoryFactoryFor(
      'enrollments',
      this.enrollmentRepositoryGetter,
    );
    this.registerInclusionResolver(
      'enrollments',
      this.enrollments.inclusionResolver,
    );

    this.submissions = this.createHasManyRepositoryFactoryFor(
      'submissions',
      this.submissionRepositoryGetter,
    );
    this.registerInclusionResolver(
      'submissions',
      this.submissions.inclusionResolver,
    );

    this.orders = this.createHasManyRepositoryFactoryFor(
      'orders',
      this.orderRepositoryGetter,
    );
    this.registerInclusionResolver('orders', this.orders.inclusionResolver);

    this.certificates = this.createHasManyRepositoryFactoryFor(
      'certificates',
      this.certificateRepositoryGetter,
    );
    this.registerInclusionResolver(
      'certificates',
      this.certificates.inclusionResolver,
    );

    this.sessions = this.createHasManyRepositoryFactoryFor(
      'sessions',
      this.sessionRepositoryGetter,
    );
    this.registerInclusionResolver(
      'sessions',
      this.sessions.inclusionResolver,
    );

    this.tenant = this.createBelongsToAccessorFor(
      'tenant',
      this.tenantRepositoryGetter,
    );
    this.registerInclusionResolver('tenant', this.tenant.inclusionResolver);
  }
}
