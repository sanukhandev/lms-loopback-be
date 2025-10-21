import {BindingScope, injectable, Provider, ValueOrPromise} from '@loopback/core';
import {Middleware, MiddlewareContext} from '@loopback/rest';
import {TenantBindings} from '../bindings/keys';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';

@injectable({scope: BindingScope.TRANSIENT})
export class TenantContextMiddlewareProvider implements Provider<Middleware> {
  value(): Middleware {
    return async (
      ctx: MiddlewareContext,
      next: () => ValueOrPromise<unknown>,
    ) => {
      const tenantId = sanitizeTenantId(extractTenantId(ctx.request));
      ctx.bind(TenantBindings.CURRENT_TENANT_ID).to(tenantId);
      return next();
    };
  }
}
