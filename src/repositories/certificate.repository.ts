import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  juggler,
  repository,
} from '@loopback/repository';
import {Certificate, CertificateRelations, Course, Tenant, User} from '../models';
import type {CourseRepository} from './course.repository';
import type {TenantRepository} from './tenant.repository';
import type {UserRepository} from './user.repository';

export class CertificateRepository extends DefaultCrudRepository<
  Certificate,
  typeof Certificate.prototype.id,
  CertificateRelations
> {
  public readonly tenant: BelongsToAccessor<
    Tenant,
    typeof Certificate.prototype.id
  >;
  public readonly course: BelongsToAccessor<
    Course,
    typeof Certificate.prototype.id
  >;
  public readonly user: BelongsToAccessor<
    User,
    typeof Certificate.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('TenantRepository')
    protected tenantRepositoryGetter: Getter<TenantRepository>,
    @repository.getter('CourseRepository')
    protected courseRepositoryGetter: Getter<CourseRepository>,
    @repository.getter('UserRepository')
    protected userRepositoryGetter: Getter<UserRepository>,
  ) {
    super(Certificate, dataSource);

    this.tenant = this.createBelongsToAccessorFor(
      'tenant',
      this.tenantRepositoryGetter,
    );
    this.registerInclusionResolver('tenant', this.tenant.inclusionResolver);

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
