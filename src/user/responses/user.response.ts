import { ApiProperty } from '@nestjs/swagger'

/** Public shape of a User returned by the API (no password / refresh token). */
export class UserResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  id!: string

  @ApiProperty({ example: 'aB3xY9kP' })
  shortId!: string

  @ApiProperty({ example: 'Ada' })
  firstName!: string

  @ApiProperty({ required: false, nullable: true, example: 'Lovelace' })
  lastName?: string | null

  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  email!: string

  @ApiProperty({ required: false, nullable: true })
  googleId?: string | null

  @ApiProperty({ required: false, nullable: true })
  avatarUrl?: string | null

  @ApiProperty({ required: false, nullable: true })
  avatarKey?: string | null

  @ApiProperty({ required: false, nullable: true })
  businessId?: string | null

  @ApiProperty({ example: false })
  isSystem!: boolean

  @ApiProperty({ example: true })
  isActive!: boolean

  @ApiProperty({ example: false })
  isEmailVerified!: boolean

  @ApiProperty({ example: false })
  deleted!: boolean

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    format: 'date-time',
  })
  deletedAt?: Date | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date
}

/** Whether a user has a password set. */
export class HasPasswordResponse {
  @ApiProperty({ example: true })
  hasPassword!: boolean
}

/** A simple human-readable message response. */
export class MessageResponse {
  @ApiProperty({
    example: 'A verification code has been sent to the new email.',
  })
  message!: string
}
