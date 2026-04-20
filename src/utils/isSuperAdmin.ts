import { Profile } from '../types/database';

export function isSuperAdmin(profile: Profile | null | undefined): boolean {
  return profile?.is_super_admin === true;
}

export function requireSuperAdmin(profile: Profile | null | undefined): void {
  if (!isSuperAdmin(profile)) {
    throw new Error('Super admin privileges required');
  }
}
