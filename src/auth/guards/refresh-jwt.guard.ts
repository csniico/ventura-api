import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Requires a valid (non-revoked) refresh token in the Authorization header. */
@Injectable()
export class RefreshJwtGuard extends AuthGuard('refresh-jwt') {}
