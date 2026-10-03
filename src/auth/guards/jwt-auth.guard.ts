import { type ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/**
 * Requires a valid bearer access token. Attaches { userId } to request.user.
 *
 * Registered globally as an APP_GUARD, so it applies to every route; routes
 * marked `@Public()` are skipped. Keeping the class usable as a plain
 * `@UseGuards(JwtAuthGuard)` too is harmless — the global instance runs first
 * and a second pass is a no-op.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true
    return super.canActivate(context)
  }
}
