import {HttpErrors, Request} from '@loopback/rest';

const TENANT_HEADER = 'x-tenant-id';
const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function extractTenantId(request: Request): string {
  const rawHeader = request.headers[TENANT_HEADER];
  const tenantId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (!tenantId?.trim()) {
    throw new HttpErrors.BadRequest('Missing x-tenant-id header');
  }

  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new HttpErrors.BadRequest('Invalid tenant identifier');
  }

  return tenantId.trim();
}

export function buildTenantDatabaseName(tenantId: string): string {
  const prefix = process.env.TENANT_DB_PREFIX ?? 'tenant';
  return `${prefix}_${tenantId.replace(/-/g, '_').toLowerCase()}`;
}

export function sanitizeTenantId(tenantId: string): string {
  return tenantId.replace(/-/g, '_').toLowerCase();
}

export function getTenantHeaderName(): string {
  return TENANT_HEADER;
}
