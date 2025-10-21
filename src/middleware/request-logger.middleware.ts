import {
  BindingScope,
  inject,
  injectable,
  Provider,
  ValueOrPromise,
} from '@loopback/core';
import {Middleware, MiddlewareContext} from '@loopback/rest';
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';

@injectable({scope: BindingScope.TRANSIENT})
export class RequestLoggerMiddlewareProvider implements Provider<Middleware> {
  constructor(
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  value(): Middleware {
    return async (
      ctx: MiddlewareContext,
      next: () => ValueOrPromise<unknown>,
    ) => {
      const start = process.hrtime.bigint();
      const {request, response} = ctx;
      const tenantId = request.headers['x-tenant-id'];
      const correlationId =
        request.headers['x-request-id'] ?? request.headers['x-correlation-id'];

      try {
        const result = await next();
        this.logger.info(
          this.buildLogContext(ctx, start, correlationId, tenantId),
          'request completed',
        );
        return result;
      } catch (error) {
        const statusCode = this.getErrorStatusCode(error);
        const context = this.buildLogContext(
          ctx,
          start,
          correlationId,
          tenantId,
          statusCode,
        );

        if (statusCode !== undefined && statusCode < 500) {
          this.logger.warn(context, 'request failed');
        } else {
          this.logger.error({...context, err: error}, 'request failed');
        }
        throw error;
      }
    };
  }

  private buildLogContext(
    ctx: MiddlewareContext,
    start: bigint,
    correlationId: unknown,
    tenantId: unknown,
    statusCodeOverride?: number,
  ) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    return {
      method: ctx.request.method,
      url: ctx.request.originalUrl ?? ctx.request.url,
      statusCode: statusCodeOverride ?? ctx.response.statusCode ?? 500,
      durationMs: Number(durationMs.toFixed(3)),
      tenantId,
      correlationId,
      remoteAddress:
        ctx.request.ip ?? ctx.request.socket?.remoteAddress ?? 'unknown',
      userAgent: ctx.request.headers['user-agent'],
    };
  }

  private getErrorStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const status = (error as {statusCode?: number; status?: number}).statusCode;
    if (typeof status === 'number') {
      return status;
    }

    const legacyStatus = (error as {status?: number}).status;
    if (typeof legacyStatus === 'number') {
      return legacyStatus;
    }

    return undefined;
  }
}
