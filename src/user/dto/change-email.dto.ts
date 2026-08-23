import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator'
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator'

/** Step 1: request a change to a new email address (sends a code to it). */
export class RequestEmailChangeDto {
  @ApiProperty({ example: 'new-address@example.com', format: 'email' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  newEmail!: string
}

/** Step 2: confirm the change by entering the emailed 6-digit code. */
export class ConfirmEmailChangeDto {
  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  code!: string
}
