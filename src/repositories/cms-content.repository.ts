import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  juggler,
  repository,
} from '@loopback/repository';
import {CmsContent, CmsContentRelations, Tenant} from '../models';
import type {TenantRepository} from './tenant.repository';

export class CmsContentRepository extends DefaultCrudRepository<
  CmsContent,
  typeof CmsContent.prototype.id,
  CmsContentRelations
> {
  public readonly tenant: BelongsToAccessor<
    Tenant,
    typeof CmsContent.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('TenantRepository')
    protected tenantRepositoryGetter: Getter<TenantRepository>,
  ) {
    super(CmsContent, dataSource);

    this.tenant = this.createBelongsToAccessorFor(
      'tenant',
      this.tenantRepositoryGetter,
    );
    this.registerInclusionResolver('tenant', this.tenant.inclusionResolver);
  }
}
