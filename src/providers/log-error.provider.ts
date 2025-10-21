import {inject, Provider} from '@loopback/core';
import {LogError, Request} from '@loopback/rest';
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';

export class LogErrorProvider implements Provider<LogError> {
  constructor(
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  value(): LogError {
    return (err, statusCode, request) => {
      this.logger.error(
        {
          err,
          statusCode,
          method: request.method,
          path: request.originalUrl ?? request.url,
          tenantId: request.headers['x-tenant-id'],
          correlationId: this.getCorrelationId(request),
          userAgent: request.headers['user-agent'],
        },
        'unhandled request error',
      );
    };
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
}
