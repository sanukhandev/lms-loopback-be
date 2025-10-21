import {UserProfile} from '@loopback/security';

export type UserRole =
  | 'superAdmin'
  | 'tenantAdmin'
  | 'instructor'
  | 'student';

export interface LmsUserProfile extends UserProfile {
  id: string;
  email: string;
  tenantId: string;
  roles: UserRole[];
  permissions?: string[];
  name?: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  roles: UserRole[];
  name?: string;
  permissions?: string[];
  tokenType?: 'access' | 'refresh';
  [key: string]: unknown;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export interface TokenService {
  generateTokenPair(profile: LmsUserProfile): Promise<TokenResponse>;
  verifyAccessToken(token: string): Promise<JwtPayload>;
  verifyRefreshToken(token: string): Promise<JwtPayload>;
}

export interface PasswordHasher {
  hashPassword(plain: string): Promise<string>;
  comparePassword(plain: string, hashed: string): Promise<boolean>;
}
