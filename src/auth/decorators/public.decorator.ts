import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'

/**
 * Opts a route (or a whole controller) out of the global `JwtAuthGuard`.
 *
 * Authentication is fail-closed: every route requires a bearer access token
 * unless it is explicitly marked `@Public()`. Adding a new public route is
 * therefore a deliberate, reviewable act — a forgotten guard can no longer
 * silently expose an endpoint.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
