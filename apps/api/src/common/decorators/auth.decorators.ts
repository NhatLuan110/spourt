import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { UserRole } from '@sprout/shared';

export const IS_PUBLIC_KEY = 'sprout:isPublic';
export const ROLES_KEY = 'sprout:roles';

/** Opts a route out of JwtAuthGuard, which is applied globally. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  timezone: string;
  dayRolloverHour: number;
}

export interface RequestWithUser extends FastifyRequest {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
