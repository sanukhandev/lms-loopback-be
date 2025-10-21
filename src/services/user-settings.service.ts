import {BindingScope, inject, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Logger} from 'pino';
import {PasswordHasher} from '../auth/types';
import {AuthBindings, LoggingBindings} from '../bindings/keys';
import {User} from '../models';
import {UserRepository} from '../repositories';

export interface ProfileUpdateRequest {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  avatarUrl?: string;
  jobTitle?: string;
  bio?: string;
  timezone?: string;
  locale?: string;
  socialLinks?: User['socialLinks'];
}

export interface NotificationPreferencesRequest {
  email?: boolean;
  sms?: boolean;
  push?: boolean;
  marketingOptIn?: boolean;
}

export interface PasswordUpdateRequest {
  currentPassword: string;
  newPassword: string;
}

@injectable({scope: BindingScope.TRANSIENT})
export class UserSettingsService {
  constructor(
    @repository(UserRepository)
    private readonly userRepository: UserRepository,
    @inject(AuthBindings.PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  async getProfile(userId: string, tenantId: string): Promise<User> {
    const user = await this.loadOwnedUser(userId, tenantId);
    return user;
  }

  async updateProfile(
    userId: string,
    tenantId: string,
    payload: ProfileUpdateRequest,
  ): Promise<User> {
    const user = await this.loadOwnedUser(userId, tenantId);

    const sanitizedSocial = payload.socialLinks
      ? this.cleanSocialLinks(payload.socialLinks)
      : undefined;

    await this.userRepository.updateById(userId, {
      ...payload,
      socialLinks: sanitizedSocial ?? payload.socialLinks ?? user.socialLinks,
      updatedAt: new Date().toISOString(),
    });

    const updated = await this.userRepository.findById(userId);
    this.logger.info({userId, tenantId}, 'user profile updated');
    return updated;
  }

  async updateNotificationPreferences(
    userId: string,
    tenantId: string,
    preferences: NotificationPreferencesRequest,
  ): Promise<User> {
    const user = await this.loadOwnedUser(userId, tenantId);

    const nextPreferences = {
      email: preferences.email ?? user.notificationPreferences?.email ?? true,
      sms: preferences.sms ?? user.notificationPreferences?.sms ?? false,
      push: preferences.push ?? user.notificationPreferences?.push ?? false,
    };

    await this.userRepository.updateById(userId, {
      notificationPreferences: nextPreferences,
      marketingOptIn:
        preferences.marketingOptIn ?? user.marketingOptIn ?? true,
      updatedAt: new Date().toISOString(),
    });

    const updated = await this.userRepository.findById(userId);
    this.logger.info({userId, tenantId}, 'user preferences updated');
    return updated;
  }

  async updatePassword(
    userId: string,
    tenantId: string,
    payload: PasswordUpdateRequest,
  ): Promise<void> {
    if (payload.newPassword.length < 8) {
      throw new HttpErrors.BadRequest('New password must be at least 8 characters long');
    }

    const user = await this.loadOwnedUser(userId, tenantId);
    const passwordMatches = await this.passwordHasher.comparePassword(
      payload.currentPassword,
      user.password,
    );

    if (!passwordMatches) {
      throw new HttpErrors.Unauthorized('Current password is incorrect');
    }

    const hashedPassword = await this.passwordHasher.hashPassword(
      payload.newPassword,
    );

    await this.userRepository.updateById(userId, {
      password: hashedPassword,
      lastPasswordChangedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    this.logger.info({userId, tenantId}, 'user password updated');
  }

  private async loadOwnedUser(userId: string, tenantId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.tenantId !== tenantId) {
      throw new HttpErrors.Forbidden('User does not belong to this tenant');
    }
    return user;
  }

  private cleanSocialLinks(
    links: User['socialLinks'],
  ): User['socialLinks'] {
    if (!links) {
      return links;
    }

    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(links)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        sanitized[key] = value.trim();
      }
    }

    return sanitized;
  }
}
