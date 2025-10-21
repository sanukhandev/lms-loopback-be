import {BindingScope, inject, injectable} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import jwt, {Secret, SignOptions} from 'jsonwebtoken';
import {AuthBindings} from '../bindings/keys';
import {
  JwtPayload,
  LmsUserProfile,
  TokenResponse,
  TokenService,
} from './types';

@injectable({scope: BindingScope.SINGLETON})
export class JwtTokenService implements TokenService {
  private readonly tokenSecret: Secret;
  private readonly tokenExpiresIn: string;
  private readonly refreshSecret: Secret;
  private readonly refreshExpiresIn: string;

  constructor(
    @inject(AuthBindings.TOKEN_SECRET) tokenSecret: string,
    @inject(AuthBindings.TOKEN_EXPIRES_IN) tokenExpiresIn: string,
    @inject(AuthBindings.REFRESH_TOKEN_SECRET) refreshSecret: string,
    @inject(AuthBindings.REFRESH_TOKEN_EXPIRES_IN)
    refreshExpiresIn: string,
  ) {
    if (!tokenSecret) {
      throw new Error('JWT secret is not configured');
    }
    if (!refreshSecret) {
      throw new Error('JWT refresh secret is not configured');
    }

    this.tokenSecret = tokenSecret;
    this.tokenExpiresIn = tokenExpiresIn;
    this.refreshSecret = refreshSecret;
    this.refreshExpiresIn = refreshExpiresIn;
  }

  async generateTokenPair(profile: LmsUserProfile): Promise<TokenResponse> {
    const accessPayload = this.buildPayload(profile, 'access');
    const refreshPayload = this.buildPayload(profile, 'refresh');

    const accessOptions: SignOptions = {
      expiresIn: this.tokenExpiresIn as unknown as SignOptions['expiresIn'],
    };
    const accessToken = jwt.sign(
      accessPayload,
      this.tokenSecret,
      accessOptions,
    );

    const refreshOptions: SignOptions = {
      expiresIn: this.refreshExpiresIn as unknown as SignOptions['expiresIn'],
    };
    const refreshToken = jwt.sign(
      refreshPayload,
      this.refreshSecret,
      refreshOptions,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenExpiresIn,
      refreshExpiresIn: this.refreshExpiresIn,
    };
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.verifyToken(token, this.tokenSecret, 'access');
  }

  async verifyRefreshToken(token: string): Promise<JwtPayload> {
    return this.verifyToken(token, this.refreshSecret, 'refresh');
  }

  private buildPayload(
    profile: LmsUserProfile,
    tokenType: 'access' | 'refresh',
  ): JwtPayload {
    return {
      sub: profile.id,
      email: profile.email,
      tenantId: profile.tenantId,
      roles: profile.roles,
      name: profile.name,
      permissions: profile.permissions,
      tokenType,
    };
  }

  private verifyToken(
    token: string,
    secret: Secret,
    expectedType: 'access' | 'refresh',
  ): JwtPayload {
    try {
      const decoded = jwt.verify(token, secret);
      if (typeof decoded === 'string') {
        throw new HttpErrors.Unauthorized('Invalid token payload');
      }

      const payload = decoded as JwtPayload;
      if (payload.tokenType !== expectedType) {
        throw new HttpErrors.Unauthorized('Token type mismatch');
      }

      return payload;
    } catch (err) {
      throw new HttpErrors.Unauthorized('Invalid or expired token');
    }
  }
}
