import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  juggler,
  repository,
} from '@loopback/repository';
import {
  Assignment,
  Certificate,
  Course,
  CourseRelations,
  Enrollment,
  Module,
  Order,
  Session,
  Tenant,
  User,
} from '../models';
import {AssignmentRepository} from './assignment.repository';
import type {CertificateRepository} from './certificate.repository';
import {EnrollmentRepository} from './enrollment.repository';
import type {ModuleRepository} from './module.repository';
import type {OrderRepository} from './order.repository';
import type {SessionRepository} from './session.repository';
import type {TenantRepository} from './tenant.repository';
import {UserRepository} from './user.repository';

export class CourseRepository extends DefaultCrudRepository<
  Course,
  typeof Course.prototype.id,
  CourseRelations
> {
  public readonly assignments: HasManyRepositoryFactory<
    Assignment,
    typeof Course.prototype.id
  >;
  public readonly enrollments: HasManyRepositoryFactory<
    Enrollment,
    typeof Course.prototype.id
  >;
  public readonly modules: HasManyRepositoryFactory<
    Module,
    typeof Course.prototype.id
  >;
  public readonly certificates: HasManyRepositoryFactory<
    Certificate,
    typeof Course.prototype.id
  >;
  public readonly sessions: HasManyRepositoryFactory<
    Session,
    typeof Course.prototype.id
  >;
  public readonly orders: HasManyRepositoryFactory<
    Order,
    typeof Course.prototype.id
  >;
  public readonly instructor: BelongsToAccessor<
    User,
    typeof Course.prototype.id
  >;
  public readonly tenant: BelongsToAccessor<
    Tenant,
    typeof Course.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('AssignmentRepository')
    protected assignmentRepositoryGetter: Getter<AssignmentRepository>,
    @repository.getter('EnrollmentRepository')
    protected enrollmentRepositoryGetter: Getter<EnrollmentRepository>,
    @repository.getter('ModuleRepository')
    protected moduleRepositoryGetter: Getter<ModuleRepository>,
    @repository.getter('OrderRepository')
    protected orderRepositoryGetter: Getter<OrderRepository>,
    @repository.getter('CertificateRepository')
    protected certificateRepositoryGetter: Getter<CertificateRepository>,
    @repository.getter('SessionRepository')
    protected sessionRepositoryGetter: Getter<SessionRepository>,
    @repository.getter('UserRepository')
    protected userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('TenantRepository')
    protected tenantRepositoryGetter: Getter<TenantRepository>,
  ) {
    super(Course, dataSource);

    this.assignments = this.createHasManyRepositoryFactoryFor(
      'assignments',
      this.assignmentRepositoryGetter,
    );
    this.registerInclusionResolver(
      'assignments',
      this.assignments.inclusionResolver,
    );

    this.enrollments = this.createHasManyRepositoryFactoryFor(
      'enrollments',
      this.enrollmentRepositoryGetter,
    );
    this.registerInclusionResolver(
      'enrollments',
      this.enrollments.inclusionResolver,
    );

    this.modules = this.createHasManyRepositoryFactoryFor(
      'modules',
      this.moduleRepositoryGetter,
    );
    this.registerInclusionResolver('modules', this.modules.inclusionResolver);

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
    this.registerInclusionResolver('sessions', this.sessions.inclusionResolver);

    this.orders = this.createHasManyRepositoryFactoryFor(
      'orders',
      this.orderRepositoryGetter,
    );
    this.registerInclusionResolver('orders', this.orders.inclusionResolver);

    this.instructor = this.createBelongsToAccessorFor(
      'instructor',
      this.userRepositoryGetter,
    );
    this.registerInclusionResolver(
      'instructor',
      this.instructor.inclusionResolver,
    );

    this.tenant = this.createBelongsToAccessorFor(
      'tenant',
      this.tenantRepositoryGetter,
    );
    this.registerInclusionResolver('tenant', this.tenant.inclusionResolver);
  }
}
