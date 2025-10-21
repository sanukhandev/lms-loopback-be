import {BindingScope, inject, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';
import {Tenant} from '../models';
import {TenantRepository} from '../repositories';

export interface TenantSettingsUpdateRequest {
  name?: string;
  logoUrl?: string;
  domain?: string;
  hostnames?: string[];
  primaryContactName?: string;
  primaryContactEmail?: string;
  supportEmail?: string;
  supportPhone?: string;
  defaultLocale?: string;
  defaultTimezone?: string;
  address?: Tenant['address'];
  branding?: Tenant['branding'];
  billingSettings?: Tenant['billingSettings'];
}

export interface DropboxConfigRequest {
  appKey?: string;
  appSecret?: string;
  refreshToken?: string;
  rootPath?: string;
  status?: 'pending' | 'connected' | 'error';
}

@injectable({scope: BindingScope.TRANSIENT})
export class TenantSettingsService {
  constructor(
    @repository(TenantRepository)
    private readonly tenantRepository: TenantRepository,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  async getSettings(tenantId: string): Promise<Tenant> {
    return this.loadTenant(tenantId);
  }

  async updateSettings(
    tenantId: string,
    payload: TenantSettingsUpdateRequest,
  ): Promise<Tenant> {
    const tenant = await this.loadTenant(tenantId);

    const normalizedHostnames = payload.hostnames
      ? this.normalizeHostnames(payload.hostnames)
      : undefined;

    await this.tenantRepository.updateById(tenantId, {
      ...payload,
      hostnames: normalizedHostnames ?? payload.hostnames ?? tenant.hostnames,
      branding: this.mergeObjects(tenant.branding, payload.branding),
      address: this.mergeObjects(tenant.address, payload.address),
      billingSettings: this.mergeObjects(tenant.billingSettings, payload.billingSettings),
      updatedAt: new Date().toISOString(),
    });

    const updated = await this.tenantRepository.findById(tenantId);
    this.logger.info({tenantId}, 'tenant settings updated');
    return updated;
  }

  async updateDropboxConfig(
    tenantId: string,
    config: DropboxConfigRequest,
  ): Promise<Tenant> {
    const tenant = await this.loadTenant(tenantId);

    const dropboxConfig = {
      ...(tenant.dropboxConfig ?? {}),
      ...config,
      status: config.status ?? tenant.dropboxConfig?.status ?? 'pending',
      connectedAt:
        config.status === 'connected'
          ? new Date().toISOString()
          : tenant.dropboxConfig?.connectedAt,
      lastSyncedAt: tenant.dropboxConfig?.lastSyncedAt,
    };

    await this.tenantRepository.updateById(tenantId, {
      dropboxConfig,
      updatedAt: new Date().toISOString(),
    });

    const updated = await this.tenantRepository.findById(tenantId);
    this.logger.info({tenantId}, 'tenant dropbox config updated');
    return updated;
  }

  private async loadTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new HttpErrors.NotFound('Tenant not found');
    }
    return tenant;
  }

  private normalizeHostnames(hostnames: string[]): string[] {
    return Array.from(
      new Set(
        hostnames
          .map(host => host.trim().toLowerCase())
          .filter(host => host.length > 0),
      ),
    );
  }

  private mergeObjects<T extends Record<string, unknown> | undefined>(
    original: T,
    updates: T,
  ): T {
    if (!original) {
      return updates;
    }
    if (!updates) {
      return original;
    }
    return {...original, ...updates};
  }
}
