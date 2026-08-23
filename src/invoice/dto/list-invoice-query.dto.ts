import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto'
import { InvoiceStatus } from '../domain/invoice.entity'

/** Query params for listing invoices: pagination/search plus status/customer. */
export class ListInvoiceQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: false, enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string
}
