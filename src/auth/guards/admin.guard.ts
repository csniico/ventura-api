import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserServiceV2 } from '../../user/application/user.service'
import { AuthUser } from '../types/auth.types'

interface AuthedRequest {
  user?: AuthUser
}

/**
 * Restricts a route to platform administrators. Must run AFTER `JwtAuthGuard`,
 * which populates `request.user`. The JWT carries only the user id, so the
 * privilege is resolved by loading the user and checking two things:
 *
 *  - `isSystem` — a seeded platform/system account, or
 *  - the account's email is in the `ADMIN_EMAILS` allow-list (comma-separated
 *    env var), which is the bootstrap/designation mechanism until a first-class
 *    admin role exists.
 *
 * A business-scoped `role` of "admin" is NOT platform admin and is not accepted.
 * Deleted accounts are always rejected.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly userService: UserServiceV2,
    private readonly config: ConfigService,
  ) {}

  private allowedEmails(): Set<string> {
    const raw = this.config.get<string>('ADMIN_EMAILS', '')
    return new Set(
      raw
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    )
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>()
    const userId = request.user?.userId
    if (!userId) {
      throw new ForbiddenException('Administrator access required.')
    }
    // getUserById throws NotFound if the token references a missing user.
    const user = await this.userService.getUserById(userId)
    const isAdmin =
      !user.deleted &&
      (user.isSystem || this.allowedEmails().has(user.email.toLowerCase()))
    if (!isAdmin) {
      throw new ForbiddenException('Administrator access required.')
    }
    return true
  }
}
