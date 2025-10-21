import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {
  HttpErrors,
  Request,
  RestBindings,
  SchemaObject,
  get,
  patch,
  post,
  requestBody,
  response
} from '@loopback/rest';
import {SecurityBindings, UserProfile, securityId} from '@loopback/security';
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';
import {User} from '../models';
import {
  NotificationPreferencesRequest,
  PasswordUpdateRequest,
  ProfileUpdateRequest,
  UserSettingsService,
} from '../services/user-settings.service';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';

const USER_PROFILE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    email: {type: 'string'},
    firstName: {type: 'string'},
    lastName: {type: 'string'},
    avatarUrl: {type: 'string'},
    phoneNumber: {type: 'string'},
    jobTitle: {type: 'string'},
    bio: {type: 'string'},
    timezone: {type: 'string'},
    locale: {type: 'string'},
    socialLinks: {type: 'object'},
    notificationPreferences: {
      type: 'object',
      properties: {
        email: {type: 'boolean'},
        sms: {type: 'boolean'},
        push: {type: 'boolean'},
      },
    },
    marketingOptIn: {type: 'boolean'},
    roles: {type: 'array', items: {type: 'string'}},
    tenantId: {type: 'string'},
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
  },
};

const PROFILE_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    firstName: {type: 'string'},
    lastName: {type: 'string'},
    phoneNumber: {type: 'string'},
    avatarUrl: {type: 'string'},
    jobTitle: {type: 'string'},
    bio: {type: 'string'},
    timezone: {type: 'string'},
    locale: {type: 'string'},
    socialLinks: {
      type: 'object',
      additionalProperties: {type: 'string'},
    },
  },
};

const PREFERENCES_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    email: {type: 'boolean'},
    sms: {type: 'boolean'},
    push: {type: 'boolean'},
    marketingOptIn: {type: 'boolean'},
  },
};

const PASSWORD_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['currentPassword', 'newPassword'],
  properties: {
    currentPassword: {type: 'string', minLength: 8},
    newPassword: {type: 'string', minLength: 8},
  },
};

@authenticate('jwt')
export class UserSettingsController {
  constructor(
    @service(UserSettingsService)
    private readonly userSettingsService: UserSettingsService,
    @inject(SecurityBindings.USER, {optional: true})
    private readonly currentUserProfile: UserProfile,
    @inject(RestBindings.Http.REQUEST)
    private readonly request: Request,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  @get('/tenant/me/profile')
  @response(200, {
    description: 'Get current user profile',
    content: {'application/json': {schema: USER_PROFILE_SCHEMA}},
  })
  async getProfile(): Promise<Record<string, unknown>> {
    const {userId, tenantId} = this.requireAuthenticatedUser();
    const user = await this.userSettingsService.getProfile(userId, tenantId);
    return this.toView(user);
  }

  @patch('/tenant/me/profile')
  @response(200, {
    description: 'Update current user profile',
    content: {'application/json': {schema: USER_PROFILE_SCHEMA}},
  })
  async updateProfile(
    @requestBody({content: {'application/json': {schema: PROFILE_UPDATE_SCHEMA}}})
    body: ProfileUpdateRequest,
  ): Promise<Record<string, unknown>> {
    const {userId, tenantId} = this.requireAuthenticatedUser();
    const updated = await this.userSettingsService.updateProfile(userId, tenantId, body);
    this.logger.info(this.buildLogContext(tenantId, {userId}), 'user profile updated');
    return this.toView(updated);
  }

  @patch('/tenant/me/preferences')
  @response(200, {
    description: 'Update notification preferences',
    content: {'application/json': {schema: USER_PROFILE_SCHEMA}},
  })
  async updatePreferences(
    @requestBody({content: {'application/json': {schema: PREFERENCES_UPDATE_SCHEMA}}})
    body: NotificationPreferencesRequest,
  ): Promise<Record<string, unknown>> {
    const {userId, tenantId} = this.requireAuthenticatedUser();
    const updated = await this.userSettingsService.updateNotificationPreferences(userId, tenantId, body);
    this.logger.info(this.buildLogContext(tenantId, {userId}), 'user preferences updated');
    return this.toView(updated);
  }

  @post('/tenant/me/password')
  @response(204, {
    description: 'Update current user password',
  })
  async updatePassword(
    @requestBody({content: {'application/json': {schema: PASSWORD_UPDATE_SCHEMA}}})
    body: PasswordUpdateRequest,
  ): Promise<void> {
    const {userId, tenantId} = this.requireAuthenticatedUser();
    await this.userSettingsService.updatePassword(userId, tenantId, body);
    this.logger.info(this.buildLogContext(tenantId, {userId}), 'user password updated');
  }

  private requireAuthenticatedUser(): {userId: string; tenantId: string} {
    const tenantHeader = sanitizeTenantId(extractTenantId(this.request));
    const profile = this.currentUserProfile;
    if (!profile) {
      throw new HttpErrors.Unauthorized('Authentication required');
    }

    const userId = profile[securityId] ?? (profile as {id?: string}).id;
    const profileTenant = (profile as {tenantId?: string}).tenantId;
    const tenantId = profileTenant
      ? sanitizeTenantId(profileTenant)
      : tenantHeader;

    if (!userId) {
      throw new HttpErrors.InternalServerError('Authenticated user context missing');
    }

    if (!tenantId) {
      throw new HttpErrors.BadRequest('Tenant context missing');
    }

    if (tenantId !== tenantHeader) {
      throw new HttpErrors.Forbidden('User does not belong to this tenant');
    }

    return {userId, tenantId};
  }

  private toView(user: User): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      phoneNumber: user.phoneNumber,
      jobTitle: user.jobTitle,
      bio: user.bio,
      timezone: user.timezone,
      locale: user.locale,
      socialLinks: user.socialLinks,
      notificationPreferences: user.notificationPreferences,
      marketingOptIn: user.marketingOptIn,
      roles: user.roles,
      tenantId: user.tenantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private buildLogContext(
    tenantId: string,
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      tenantId,
      method: this.request.method,
      path: this.request.originalUrl ?? this.request.url,
      ...extra,
    };
  }
}
