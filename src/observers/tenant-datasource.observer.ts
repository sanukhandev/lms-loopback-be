import {lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {TenantDataSourceProvider} from '../services/tenant-datasource.provider';

@lifeCycleObserver('datasource')
export class TenantDataSourceObserver implements LifeCycleObserver {
  async stop(): Promise<void> {
    await TenantDataSourceProvider.disconnectAll();
  }
}
