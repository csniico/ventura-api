import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto'
import { OrderStatus } from '../domain/order.entity'

/** Query params for listing orders: pagination/search plus status/customer. */
export class ListOrderQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: false, enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string
}
