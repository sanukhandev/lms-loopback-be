import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  juggler,
  repository,
} from '@loopback/repository';
import {Course, Order, OrderRelations, Tenant, User} from '../models';
import type {CourseRepository} from './course.repository';
import type {TenantRepository} from './tenant.repository';
import type {UserRepository} from './user.repository';

export class OrderRepository extends DefaultCrudRepository<
  Order,
  typeof Order.prototype.id,
  OrderRelations
> {
  public readonly tenant: BelongsToAccessor<
    Tenant,
    typeof Order.prototype.id
  >;
  public readonly user: BelongsToAccessor<
    User,
    typeof Order.prototype.id
  >;
  public readonly course: BelongsToAccessor<
    Course,
    typeof Order.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('TenantRepository')
    protected tenantRepositoryGetter: Getter<TenantRepository>,
    @repository.getter('UserRepository')
    protected userRepositoryGetter: Getter<UserRepository>,
    @repository.getter('CourseRepository')
    protected courseRepositoryGetter: Getter<CourseRepository>,
  ) {
    super(Order, dataSource);

    this.tenant = this.createBelongsToAccessorFor(
      'tenant',
      this.tenantRepositoryGetter,
    );
    this.registerInclusionResolver('tenant', this.tenant.inclusionResolver);

    this.user = this.createBelongsToAccessorFor(
      'user',
      this.userRepositoryGetter,
    );
    this.registerInclusionResolver('user', this.user.inclusionResolver);

    this.course = this.createBelongsToAccessorFor(
      'course',
      this.courseRepositoryGetter,
    );
    this.registerInclusionResolver('course', this.course.inclusionResolver);
  }
}
