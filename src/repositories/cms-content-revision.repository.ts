import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  juggler,
  repository,
} from '@loopback/repository';
import {
  CmsContent,
  CmsContentRevision,
  CmsContentRevisionRelations,
  Tenant,
} from '../models';
import type {CmsContentRepository} from './cms-content.repository';
import type {TenantRepository} from './tenant.repository';

export class CmsContentRevisionRepository extends DefaultCrudRepository<
  CmsContentRevision,
  typeof CmsContentRevision.prototype.id,
  CmsContentRevisionRelations
> {
  public readonly cmsContent: BelongsToAccessor<
    CmsContent,
    typeof CmsContentRevision.prototype.id
  >;

  public readonly tenant: BelongsToAccessor<
    Tenant,
    typeof CmsContentRevision.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('CmsContentRepository')
    protected cmsContentRepositoryGetter: Getter<CmsContentRepository>,
    @repository.getter('TenantRepository')
    protected tenantRepositoryGetter: Getter<TenantRepository>,
  ) {
    super(CmsContentRevision, dataSource);

    this.cmsContent = this.createBelongsToAccessorFor(
      'cmsContent',
      this.cmsContentRepositoryGetter,
    );
    this.registerInclusionResolver(
      'cmsContent',
      this.cmsContent.inclusionResolver,
    );

    this.tenant = this.createBelongsToAccessorFor(
      'tenant',
      this.tenantRepositoryGetter,
    );
    this.registerInclusionResolver('tenant', this.tenant.inclusionResolver);
  }
}
