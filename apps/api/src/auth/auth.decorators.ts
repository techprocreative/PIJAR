import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { Role } from '@pijar/shared';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard as CommonRolesGuard } from '../common/guards/roles.guard';

// Guard global (APP_GUARD: Throttler → JwtAuthGuard → RolesGuard) sudah
// terpasang di AuthModule; endpoint cukup menandai @Public() / @Roles().
// Helper di bawah disediakan agar controller lain bisa memakai gaya deklaratif.

export { ROLES_KEY };

/** Batasi endpoint ke role tertentu (diproses RolesGuard global). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Endpoint butuh login — default (tanpa @Public), disediakan untuk eksplisit. */
export const Auth = () => applyDecorators();

/** Endpoint butuh login + role spesifik. */
export const AuthRoles = (...roles: Role[]) => applyDecorators(Roles(...roles));

// Re-export guard untuk pengujian/unit bila diperlukan identitas kelas.
export { CommonRolesGuard as RolesGuard };
