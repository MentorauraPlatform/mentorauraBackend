import { SetMetadata } from '@nestjs/common';

export enum Role {
  MENTEE = 'mentee',
  MENTOR = 'mentor',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export const ROLES_KEY = 'roles';
/**
 * Restrict a route to specific roles.
 * @example @Roles(Role.ADMIN, Role.SUPER_ADMIN)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
