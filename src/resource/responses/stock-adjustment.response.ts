import { ApiProperty } from '@nestjs/swagger'
import { StockAdjustmentReason } from '../domain/stock-adjustment.entity'

/** Public shape of a stock-adjustment ledger row returned by the API. */
export class StockAdjustmentResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  id!: string

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  businessId!: string

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  resourceId!: string

  @ApiProperty({ example: 20, description: 'Signed change applied.' })
  delta!: number

  @ApiProperty({
    enum: StockAdjustmentReason,
    example: StockAdjustmentReason.RESTOCK,
  })
  reason!: StockAdjustmentReason

  @ApiProperty({
    example: 120,
    description: 'Resulting stock after this change.',
  })
  balanceAfter!: number

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Received shipment',
  })
  note?: string | null

  @ApiProperty({
    required: false,
    nullable: true,
    example: '665f1b2c3d4e5f6a7b8c9d0e',
    description: 'User id that recorded the adjustment (null for system).',
  })
  createdBy?: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date
}
