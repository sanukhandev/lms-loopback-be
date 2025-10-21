import {BindingScope, inject, injectable, Provider} from '@loopback/core';
import {juggler} from '@loopback/repository';
import {Request, RestBindings} from '@loopback/rest';
import {URL} from 'node:url';
import {buildTenantDatabaseName, extractTenantId} from '../utils/tenant';

type DataSourceConfig = {
  connector?: string;
  database?: string;
  name?: string;
  url?: string;
  [key: string]: unknown;
};

@injectable({scope: BindingScope.TRANSIENT})
export class TenantDataSourceProvider
  implements Provider<Promise<juggler.DataSource>> {
  private static readonly cache = new Map<string, juggler.DataSource>();
  private readonly baseConfig: DataSourceConfig;

  constructor(
    @inject(RestBindings.Http.REQUEST) private readonly request: Request,
    @inject('datasources.config.mongoTenant', {optional: true})
    baseConfig: DataSourceConfig = {},
  ) {
    this.baseConfig = {...baseConfig};
  }

  async value(): Promise<juggler.DataSource> {
    const tenantId = extractTenantId(this.request);

    if (!TenantDataSourceProvider.cache.has(tenantId)) {
      const dataSource = new juggler.DataSource(
        this.buildTenantConfig(tenantId),
      );
      TenantDataSourceProvider.cache.set(tenantId, dataSource);
      dataSource.once('error', () => {
        TenantDataSourceProvider.cache.delete(tenantId);
      });
    }

    return TenantDataSourceProvider.cache.get(tenantId)!;
  }

  private buildTenantConfig(tenantId: string): DataSourceConfig {
    const dbName = buildTenantDatabaseName(tenantId);
    const {url, name, database, ...rest} = this.baseConfig;

    return {
      ...rest,
      name: `mongoTenant_${tenantId}`,
      connector: rest.connector ?? 'mongodb',
      url: this.buildConnectionUrl(dbName, url),
      database: dbName,
    };
  }

  private buildConnectionUrl(dbName: string, rawUrl?: string): string {
    const connectionUrl = rawUrl ?? process.env.MONGODB_URL;

    if (!connectionUrl) {
      throw new Error('MONGODB_URL environment variable is not set');
    }

    const parsed = new URL(connectionUrl);
    parsed.pathname = `/${dbName}`;

    return parsed.toString();
  }

  static async disconnectAll(): Promise<void> {
    const activeDataSources = Array.from(this.cache.values());
    this.cache.clear();

    await Promise.all(
      activeDataSources.map(ds => ds.disconnect().catch(() => undefined)),
    );
  }
}
