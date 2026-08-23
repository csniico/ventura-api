import { ApiProperty } from '@nestjs/swagger'
import { ResourceType } from '../../resource/domain/resource.entity'
import { OrderStatus } from '../domain/order.entity'

/** A line item on an order, with a snapshot of the resource at order time. */
export class OrderItemResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  resourceId!: string

  @ApiProperty({ enum: ResourceType, example: ResourceType.PRODUCT })
  type!: ResourceType

  @ApiProperty({ example: 'Espresso Beans 1kg' })
  name!: string

  @ApiProperty({ example: 9.99 })
  price!: number

  @ApiProperty({ example: 2 })
  quantity!: number

  @ApiProperty({ example: 19.98 })
  subTotal!: number
}

/** Public shape of an Order returned by the API. */
export class OrderResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  id!: string

  @ApiProperty({ example: 'ORD-AB3XY9KP' })
  orderNumber!: string

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  businessId!: string

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  customerId!: string

  @ApiProperty({ example: 'Ada Lovelace' })
  customerName!: string

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'ada@example.com',
    format: 'email',
  })
  customerEmail?: string | null

  @ApiProperty({ required: false, nullable: true, example: '+15551234567' })
  customerPhone?: string | null

  @ApiProperty({ type: [OrderItemResponse] })
  items!: OrderItemResponse[]

  @ApiProperty({ example: 19.98 })
  totalAmount!: number

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PENDING })
  status!: OrderStatus

  @ApiProperty({
    required: false,
    nullable: true,
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  invoiceId?: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date
}
