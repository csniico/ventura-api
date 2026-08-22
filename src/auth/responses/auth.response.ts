import { ApiProperty } from '@nestjs/swagger';
import { UserResponse } from '../../user/responses/user.response';

/** Token pair plus the authenticated user returned by sign-in endpoints. */
export class AuthResponse {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string;

  // Typed as UserResponse (not a loose Record) so the compiler rejects any
  // attempt to place raw IUser fields (password, hashedRefreshToken) here.
  @ApiProperty({ type: UserResponse })
  user!: UserResponse;
}

/** Simple message envelope returned by code-request and logout endpoints. */
export class MessageResponse {
  @ApiProperty({ example: 'Logged out.' })
  message!: string;
}
