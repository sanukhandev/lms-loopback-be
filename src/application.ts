import {AuthenticationComponent, registerAuthenticationStrategy} from '@loopback/authentication';
import {
  AuthorizationComponent,
  AuthorizationTags,
} from '@loopback/authorization';
import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {RestApplication, RestBindings, RestMiddlewareGroups} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import path from 'path';
import {RoleBasedAuthorizationProvider} from './auth/authorization.provider';
import {JWTStrategy} from './auth/jwt-strategy';
import {BcryptHasher} from './auth/password.service';
import {JwtTokenService} from './auth/token.service';
import {AuthBindings, LoggingBindings, PaymentBindings} from './bindings/keys';
import {RequestLoggerMiddlewareProvider} from './middleware/request-logger.middleware';
import {TenantContextMiddlewareProvider} from './middleware/tenant-context.middleware';
import {TenantDataSourceObserver} from './observers/tenant-datasource.observer';
import {LogErrorProvider} from './providers/log-error.provider';
import {MySequence} from './sequence';
import {CmsContentService} from './services/cms-content.service';
import {LoggerProvider} from './services/logger.provider';
import {SessionAttendanceService} from './services/session-attendance.service';
import {SessionReminderService} from './services/session-reminder.service';
import {StripeClientProvider} from './services/stripe-client.provider';
import {TenantDataSourceProvider} from './services/tenant-datasource.provider';
import {UserSettingsService} from './services/user-settings.service';
import {DefaultCommissionCalculator} from './utils/commission';

const DEFAULT_MONGO_CONFIG = {
  name: 'mongoTenant',
  connector: 'mongodb',
  url:
    process.env.MONGODB_URL ??
    'mongodb://root:root123@localhost:27017/lmsdb?authSource=admin',
};

export {ApplicationConfig};

export class LmsBeApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    // Set up the custom sequence
    this.sequence(MySequence);

    // Set up default home page
    this.static('/', path.join(__dirname, '../public'));

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    this.projectRoot = __dirname;
    this.bind(LoggingBindings.LOGGER).toProvider(LoggerProvider);
    this.bind(RestBindings.SequenceActions.LOG_ERROR).toProvider(
      LogErrorProvider,
    );
    this.bind('datasources.config.mongoTenant').to(DEFAULT_MONGO_CONFIG);
    this.bind('datasources.mongoTenant').toProvider(TenantDataSourceProvider);
    this.lifeCycleObserver(TenantDataSourceObserver);
    this.middleware(RequestLoggerMiddlewareProvider, {
      group: RestMiddlewareGroups.MIDDLEWARE,
    });
    this.middleware(TenantContextMiddlewareProvider, {
      group: RestMiddlewareGroups.AUTHENTICATION,
    });

    this.component(AuthenticationComponent);
    this.component(AuthorizationComponent);
    registerAuthenticationStrategy(this, JWTStrategy);
    this.bind('authorization.authorizer.tenantRbac')
      .toProvider(RoleBasedAuthorizationProvider)
      .tag(AuthorizationTags.AUTHORIZER);

    this.bind(AuthBindings.TOKEN_SECRET).to(
      process.env.JWT_SECRET ?? 'change-me',
    );
    this.bind(AuthBindings.TOKEN_EXPIRES_IN).to(
      process.env.JWT_EXPIRES_IN ?? '1d',
    );
    this.bind(AuthBindings.REFRESH_TOKEN_SECRET).to(
      process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh',
    );
    this.bind(AuthBindings.REFRESH_TOKEN_EXPIRES_IN).to(
      process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    );

    const bcryptRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? '10');
    this.bind(AuthBindings.BCRYPT_ROUNDS).to(Number.isNaN(bcryptRounds) ? 10 : bcryptRounds);
    this.bind(AuthBindings.PASSWORD_HASHER).toClass(BcryptHasher);
    this.bind(AuthBindings.TOKEN_SERVICE).toClass(JwtTokenService);

    this.bind(PaymentBindings.COMMISSION_SERVICE).toClass(
      DefaultCommissionCalculator,
    );
    this.bind(PaymentBindings.STRIPE_CLIENT).toProvider(StripeClientProvider);
    if (process.env.STRIPE_SECRET_KEY) {
      this.bind('config.stripe.secret').to(process.env.STRIPE_SECRET_KEY);
    }

    this.service(SessionAttendanceService);
    this.service(SessionReminderService);
    this.service(CmsContentService);
    this.service(UserSettingsService);

    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };
  }
}
