import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {
  HttpErrors,
  Request,
  RestBindings,
  SchemaObject,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {securityId} from '@loopback/security';
import {Logger} from 'pino';
import {JwtPayload, LmsUserProfile, PasswordHasher, TokenResponse, TokenService, UserRole} from '../auth/types';
import {AuthBindings, LoggingBindings} from '../bindings/keys';
import {User} from '../models';
import {UserRepository} from '../repositories';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';

const REGISTER_REQUEST_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['email', 'password', 'firstName', 'lastName'],
  properties: {
    email: {type: 'string', format: 'email'},
    password: {type: 'string', minLength: 8},
    firstName: {type: 'string', minLength: 1},
    lastName: {type: 'string', minLength: 1},
    roles: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['tenantAdmin', 'instructor', 'student'],
      },
    },
  },
};

const LOGIN_REQUEST_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: {type: 'string', format: 'email'},
    password: {type: 'string', minLength: 8},
  },
};

const REFRESH_REQUEST_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['refreshToken'],
  properties: {
    refreshToken: {type: 'string', minLength: 20},
  },
};

const USER_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    email: {type: 'string'},
    firstName: {type: 'string'},
    lastName: {type: 'string'},
    roles: {
      type: 'array',
      items: {type: 'string'},
    },
    status: {type: 'string'},
    tenantId: {type: 'string'},
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
  },
};

const TOKENS_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    accessToken: {type: 'string'},
    refreshToken: {type: 'string'},
    expiresIn: {type: 'string'},
    refreshExpiresIn: {type: 'string'},
  },
};

const AUTH_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    user: USER_RESPONSE_SCHEMA,
    tokens: TOKENS_RESPONSE_SCHEMA,
  },
};

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roles?: UserRole[];
}

interface LoginRequest {
  email: string;
  password: string;
}

interface RefreshRequest {
  refreshToken: string;
}

interface AuthUserView {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
  status?: string;
  tenantId: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthResponse {
  user: AuthUserView;
  tokens: TokenResponse;
}

export class AuthController {
  constructor(
    @repository(UserRepository)
    private readonly userRepository: UserRepository,
    @inject(AuthBindings.PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @inject(AuthBindings.TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @inject(RestBindings.Http.REQUEST)
    private readonly request: Request,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  @post('/auth/register')
  @response(201, {
    description: 'Register a new user within the tenant',
    content: {'application/json': {schema: AUTH_RESPONSE_SCHEMA}},
  })
  async register(
    @requestBody({content: {'application/json': {schema: REGISTER_REQUEST_SCHEMA}}})
    body: RegisterRequest,
  ): Promise<AuthResponse> {
    const rawTenantId = extractTenantId(this.request);
    const tenantId = sanitizeTenantId(rawTenantId);
    const normalizedEmail = body.email.toLowerCase();
    const logContext = this.buildAuditContext(tenantId, normalizedEmail);

    const existing = await this.userRepository.findOne({
      where: {email: normalizedEmail},
    });
    if (existing) {
      this.logger.warn(
        {
          ...logContext,
          existingUserId: existing.id,
        },
        'registration conflict',
      );
      throw new HttpErrors.Conflict('Email is already registered');
    }

    const roles = this.validateRoles(body.roles);
    const hashedPassword = await this.passwordHasher.hashPassword(
      body.password,
    );

    const user = await this.userRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
      firstName: body.firstName,
      lastName: body.lastName,
      roles,
      tenantId,
    });

    this.logger.info(
      {
        ...logContext,
        userId: user.id,
        roles,
      },
      'user registered',
    );

    return this.buildAuthResponse(user);
  }

  @post('/auth/login')
  @response(200, {
    description: 'Authenticate user credentials',
    content: {'application/json': {schema: AUTH_RESPONSE_SCHEMA}},
  })
  async login(
    @requestBody({content: {'application/json': {schema: LOGIN_REQUEST_SCHEMA}}})
    body: LoginRequest,
  ): Promise<AuthResponse> {
    const rawTenantId = extractTenantId(this.request);
    const tenantId = sanitizeTenantId(rawTenantId);
    const normalizedEmail = body.email.toLowerCase();
    const logContext = this.buildAuditContext(tenantId, normalizedEmail);

    const user = await this.userRepository.findOne({
      where: {email: normalizedEmail},
    });

    if (!user) {
      this.logger.warn(logContext, 'login failed: user not found');
      throw new HttpErrors.Unauthorized('Invalid credentials');
    }

    if (tenantId !== user.tenantId) {
      this.logger.warn(
        {
          ...logContext,
          userId: user.id,
          userTenantId: user.tenantId,
        },
        'login failed: tenant mismatch',
      );
      throw new HttpErrors.Forbidden('User does not belong to this tenant');
    }

    if (user.status && user.status !== 'active') {
      this.logger.warn(
        {
          ...logContext,
          userId: user.id,
          status: user.status,
        },
        'login failed: inactive account',
      );
      throw new HttpErrors.Forbidden('User account is not active');
    }

    const passwordValid = await this.passwordHasher.comparePassword(
      body.password,
      user.password,
    );

    if (!passwordValid) {
      this.logger.warn(
        {
          ...logContext,
          userId: user.id,
        },
        'login failed: invalid credentials',
      );
      throw new HttpErrors.Unauthorized('Invalid credentials');
    }

    const response = await this.buildAuthResponse(user);
    this.logger.info(
      {
        ...logContext,
        userId: user.id,
        roles: response.user.roles,
      },
      'user login succeeded',
    );

    return response;
  }

  @post('/auth/refresh')
  @response(200, {
    description: 'Refresh JWT tokens',
    content: {'application/json': {schema: AUTH_RESPONSE_SCHEMA}},
  })
  async refresh(
    @requestBody({content: {'application/json': {schema: REFRESH_REQUEST_SCHEMA}}})
    body: RefreshRequest,
  ): Promise<AuthResponse> {
    const rawTenantId = extractTenantId(this.request);
    const tenantId = sanitizeTenantId(rawTenantId);
    let payload: JwtPayload;
    try {
      payload = await this.tokenService.verifyRefreshToken(
        body.refreshToken,
      );
    } catch (error) {
      this.logger.warn(
        this.buildAuditContext(tenantId, undefined, {
          reason: 'invalid refresh token',
        }),
        'refresh token verification failed',
      );
      throw error;
    }

    const context = this.buildAuditContext(tenantId, payload.email, {
      userId: payload.sub,
    });

    if (payload.tenantId && tenantId !== payload.tenantId) {
      this.logger.warn(
        {
          ...context,
          tokenTenantId: payload.tenantId,
        },
        'refresh failed: tenant mismatch',
      );
      throw new HttpErrors.Forbidden('Refresh token tenant mismatch');
    }

    const user = await this.userRepository.findById(payload.sub);

    if (!user || user.status !== 'active') {
      this.logger.warn(
        {
          ...context,
          status: user?.status,
        },
        'refresh failed: inactive user',
      );
      throw new HttpErrors.Forbidden('User is not allowed to refresh tokens');
    }

    const response = await this.buildAuthResponse(user);
    this.logger.info(
      {
        ...context,
        roles: response.user.roles,
      },
      'tokens refreshed',
    );

    return response;
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const profile = this.userToProfile(user);
    const tokens = await this.tokenService.generateTokenPair(profile);

    return {
      user: this.formatUser(user),
      tokens,
    };
  }

  private userToProfile(user: User): LmsUserProfile {
    const id = user.id ?? '';
    return {
      [securityId]: id,
      id,
      email: user.email,
      tenantId: user.tenantId,
      roles: (user.roles ?? ['student']) as UserRole[],
      name: `${user.firstName} ${user.lastName}`.trim(),
      permissions: [],
    };
  }

  private formatUser(user: User): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: (user.roles ?? ['student']) as UserRole[],
      status: user.status,
      tenantId: user.tenantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private validateRoles(roles?: UserRole[]): UserRole[] {
    if (!roles || roles.length === 0) {
      return ['student'];
    }

    const allowed: UserRole[] = ['tenantAdmin', 'instructor', 'student'];
    const invalid = roles.filter(role => !allowed.includes(role));
    if (invalid.length > 0) {
      throw new HttpErrors.BadRequest(`Invalid roles: ${invalid.join(', ')}`);
    }

    return Array.from(new Set(roles));
  }

  private buildAuditContext(
    tenantId: string,
    email?: string,
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      tenantId,
      email,
      method: this.request.method,
      path: this.request.originalUrl ?? this.request.url,
      correlationId: this.getCorrelationId(),
      ...extra,
    };
  }

  private getCorrelationId(): string | undefined {
    const requestId = this.request.headers['x-request-id'];
    if (Array.isArray(requestId)) {
      return requestId[0];
    }

    const correlationId = this.request.headers['x-correlation-id'];
    if (Array.isArray(correlationId)) {
      return correlationId[0];
    }

    return requestId ?? correlationId;
  }
}
