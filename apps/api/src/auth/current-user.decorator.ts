import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

/**
 * Ambil user terautentikasi dari request (diisi JwtAuthGuard global).
 * `@CurrentUser()` → objek User Prisma; `@CurrentUser('id')` → string id.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof User | undefined, ctx: ExecutionContext) => {
    const user: User | undefined = ctx.switchToHttp().getRequest().user;
    return field ? user?.[field] : user;
  },
);
