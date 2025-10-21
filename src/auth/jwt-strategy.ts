import {AuthenticationStrategy} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {HttpErrors, Request} from '@loopback/rest';
import {securityId} from '@loopback/security';
import jwt from 'jsonwebtoken';
import {Logger} from 'pino';
import {AuthBindings, LoggingBindings} from '../bindings/keys';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';
import {JwtPayload, LmsUserProfile} from './types';

export class JWTStrategy implements AuthenticationStrategy {
  name = 'jwt';

  constructor(
    @inject(AuthBindings.TOKEN_SECRET)
    private readonly jwtSecret: string,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  async authenticate(request: Request): Promise<LmsUserProfile | undefined> {
    const token = this.extractToken(request);
    const correlationId = this.getCorrelationId(request);
    const requestInfo = this.buildRequestLogContext(request, correlationId);
    if (!token) {
      this.logger.warn(requestInfo, 'authorization header missing');
      throw new HttpErrors.Unauthorized('Authorization header not found');
    }

    let payload: JwtPayload;
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      if (typeof decoded === 'string') {
        this.logger.warn(requestInfo, 'access token payload is a string');
        throw new HttpErrors.Unauthorized('Invalid access token payload');
      }
      payload = decoded as JwtPayload;
    } catch (error) {
      this.logger.warn({...requestInfo, err: error}, 'invalid access token');
      throw new HttpErrors.Unauthorized('Invalid access token');
    }

    const tenantIdFromHeader = extractTenantId(request);
    const normalizedHeaderTenant = sanitizeTenantId(tenantIdFromHeader);
    const normalizedPayloadTenant = payload.tenantId
      ? sanitizeTenantId(payload.tenantId)
      : undefined;

    if (normalizedPayloadTenant && normalizedPayloadTenant !== normalizedHeaderTenant) {
      this.logger.warn(
        {
          ...requestInfo,
          userId: payload.sub,
          tenantFromHeader: normalizedHeaderTenant,
          tenantFromToken: normalizedPayloadTenant,
        },
        'token tenant mismatch',
      );
      throw new HttpErrors.Forbidden('Token tenant mismatch');
    }

    const profile: LmsUserProfile = {
      [securityId]: payload.sub,
      id: payload.sub,
      email: payload.email,
      tenantId: normalizedPayloadTenant ?? normalizedHeaderTenant,
      roles: payload.roles ?? ['student'],
      name: payload.name ?? payload.email,
      permissions: payload.permissions,
    };

    this.logger.debug({
      ...requestInfo,
      userId: payload.sub,
      tenantId: profile.tenantId,
      roles: profile.roles,
    }, 'jwt authenticated');

    return profile;
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new HttpErrors.Unauthorized('Authorization header is not of type Bearer');
    }

    return parts[1];
  }

  private getCorrelationId(request: Request): string | undefined {
    const requestId = request.headers['x-request-id'];
    if (Array.isArray(requestId)) {
      return requestId[0];
    }

    const correlationId = request.headers['x-correlation-id'];
    if (Array.isArray(correlationId)) {
      return correlationId[0];
    }

    return requestId ?? correlationId;
  }

  private buildRequestLogContext(
    request: Request,
    correlationId?: string,
  ): Record<string, unknown> {
    return {
      method: request.method,
      path: request.originalUrl ?? request.url,
      correlationId,
      tenantHeader: request.headers['x-tenant-id'],
      userAgent: request.headers['user-agent'],
    };
  }
}
