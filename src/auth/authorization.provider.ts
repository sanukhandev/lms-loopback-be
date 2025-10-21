import {
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationMetadata,
  Authorizer,
} from '@loopback/authorization';
import {BindingScope, injectable, Provider} from '@loopback/core';
import {TenantBindings} from '../bindings/keys';
import {LmsUserProfile, UserRole} from './types';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  superAdmin: 4,
  tenantAdmin: 3,
  instructor: 2,
  student: 1,
};

@injectable({scope: BindingScope.SINGLETON})
export class RoleBasedAuthorizationProvider implements Provider<Authorizer> {
  value(): Authorizer {
    return this.authorize.bind(this);
  }

  async authorize(
    context: AuthorizationContext,
    metadata: AuthorizationMetadata,
  ): Promise<AuthorizationDecision> {
    const principal = context.principals[0] as LmsUserProfile | undefined;
    if (!principal) {
      return AuthorizationDecision.DENY;
    }

    const invocationTenant = await context.invocationContext.get(
      TenantBindings.CURRENT_TENANT_ID,
      {optional: true},
    );

    if (principal.roles?.includes('superAdmin')) {
      return AuthorizationDecision.ALLOW;
    }

    if (
      invocationTenant &&
      principal.tenantId &&
      principal.tenantId !== invocationTenant
    ) {
      return AuthorizationDecision.DENY;
    }

    const allowedRoles = (metadata.allowedRoles ?? []) as UserRole[];
    if (allowedRoles.length === 0) {
      return AuthorizationDecision.ALLOW;
    }

    if (this.isRoleAllowed(principal.roles ?? [], allowedRoles)) {
      return AuthorizationDecision.ALLOW;
    }

    return AuthorizationDecision.DENY;
  }

  private isRoleAllowed(
    userRoles: UserRole[],
    allowedRoles: UserRole[],
  ): boolean {
    const maxUserRole = userRoles.reduce<number>((acc, role) => {
      return Math.max(acc, ROLE_HIERARCHY[role] ?? 0);
    }, 0);

    return allowedRoles.some(
      role => maxUserRole >= (ROLE_HIERARCHY[role] ?? Number.MAX_SAFE_INTEGER),
    );
  }
}
