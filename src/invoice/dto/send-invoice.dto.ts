import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator'

/** Send an invoice to its customer, with an optional covering note. */
export class SendInvoiceDto {
  /**
   * Optional confirmation of the recipient. It must match the invoice's own
   * customer email — it cannot redirect the mail elsewhere.
   */
  @ApiProperty({
    required: false,
    example: 'ada@example.com',
    description: "Must match the invoice's customer email.",
  })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiProperty({
    required: false,
    maxLength: 2000,
    example: 'Thanks for your business — payment is due in 14 days.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string
}
