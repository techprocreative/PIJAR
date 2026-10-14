import { SetMetadata } from '@nestjs/common';
import { Role } from '@pijar/shared';

export const ROLES_KEY = 'roles';

/** Alias menuju common/decorators — dipertahankan untuk import yang sudah ada. */
export { Roles } from '../common/decorators/roles.decorator';
