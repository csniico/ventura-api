import { ApiProperty } from '@nestjs/swagger';

/** Token pair plus the authenticated user returned by sign-in endpoints. */
export class AuthResponse {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string;

  @ApiProperty({ type: Object })
  user!: Record<string, unknown>;
}

/** Simple message envelope returned by code-request and logout endpoints. */
export class MessageResponse {
  @ApiProperty({ example: 'Logged out.' })
  message!: string;
}
