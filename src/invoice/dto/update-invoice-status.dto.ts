import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { InvoiceStatus } from '../domain/invoice.entity'

export class UpdateInvoiceStatusDto {
  @ApiProperty({ enum: InvoiceStatus })
  @IsEnum(InvoiceStatus)
  status!: InvoiceStatus
}
