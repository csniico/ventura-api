/** Claims carried in the JWT (kept minimal: subject = userId). */
export interface JwtPayload {
  sub: string;
}

/** What JwtAuthGuard attaches to request.user after validation. */
export interface AuthUser {
  userId: string;
}

/** Token pair returned to clients on successful auth. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Full auth response: tokens plus the authenticated user (no secrets). */
export interface AuthResult extends AuthTokens {
  user: Record<string, unknown>;
}
