import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString } from 'class-validator'

/** Send an invoice to the customer, optionally overriding the recipient. */
export class SendInvoiceDto {
  @ApiProperty({ required: false, example: 'ada@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiProperty({
    required: false,
    example: 'Thanks for your business — payment is due in 14 days.',
  })
  @IsOptional()
  @IsString()
  message?: string
}
