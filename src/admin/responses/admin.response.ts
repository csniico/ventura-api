import { ApiProperty } from '@nestjs/swagger'

/** Public shape of an Admin returned by the API. */
export class AdminResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  id!: string

  @ApiProperty({ example: 'aB3xY9kP' })
  shortId!: string

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string

  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  email!: string

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date
}
