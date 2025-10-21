import {Getter, inject} from '@loopback/core';
import {
  DefaultCrudRepository,
  HasManyRepositoryFactory,
  juggler,
  repository,
} from '@loopback/repository';
import {
  Certificate,
  CmsContent,
  Course,
  Order,
  Tenant,
  TenantRelations,
  User,
} from '../models';
import {CertificateRepository} from './certificate.repository';
import {CmsContentRepository} from './cms-content.repository';
import type {CourseRepository} from './course.repository';
import {OrderRepository} from './order.repository';
import type {UserRepository} from './user.repository';

export class TenantRepository extends DefaultCrudRepository<
  Tenant,
  typeof Tenant.prototype.id,
  TenantRelations
> {
  public readonly users: HasManyRepositoryFactory<
    User,
    typeof Tenant.prototype.id
  >;
  public readonly courses: HasManyRepositoryFactory<
    Course,
    typeof Tenant.prototype.id
  >;
  public readonly orders: HasManyRepositoryFactory<
    Order,
    typeof Tenant.prototype.id
  >;
  public readonly certificates: HasManyRepositoryFactory<
    Certificate,
    typeof Tenant.prototype.id
  >;
  public readonly cmsContents: HasManyRepositoryFactory<
    CmsContent,
    typeof Tenant.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('UserRepository')
    protected userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('CourseRepository')
    protected courseRepositoryGetter: Getter<CourseRepository>,
    @repository.getter('OrderRepository')
    protected orderRepositoryGetter: Getter<OrderRepository>,
    @repository.getter('CertificateRepository')
    protected certificateRepositoryGetter: Getter<CertificateRepository>,
    @repository.getter('CmsContentRepository')
    protected cmsContentRepositoryGetter: Getter<CmsContentRepository>,
  ) {
    super(Tenant, dataSource);

    this.users = this.createHasManyRepositoryFactoryFor(
      'users',
      this.userRepositoryGetter,
    );
    this.registerInclusionResolver('users', this.users.inclusionResolver);

    this.courses = this.createHasManyRepositoryFactoryFor(
      'courses',
      this.courseRepositoryGetter,
    );
    this.registerInclusionResolver('courses', this.courses.inclusionResolver);

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

    this.cmsContents = this.createHasManyRepositoryFactoryFor(
      'cmsContents',
      this.cmsContentRepositoryGetter,
    );
    this.registerInclusionResolver(
      'cmsContents',
      this.cmsContents.inclusionResolver,
    );
  }
}
