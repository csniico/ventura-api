import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator'
import { StockAdjustmentReason } from '../domain/stock-adjustment.entity'

/** Reasons a user may pick for a manual adjustment (order flow reasons are set
 * internally and are not accepted here). */
const MANUAL_REASONS = [
  StockAdjustmentReason.RESTOCK,
  StockAdjustmentReason.CORRECTION,
  StockAdjustmentReason.MANUAL,
] as const

/** Record a manual stock movement against a product. */
export class CreateStockAdjustmentDto {
  @ApiProperty({
    example: 20,
    description:
      'Signed change: positive adds stock, negative removes it. Must be non-zero.',
  })
  @IsInt()
  delta!: number

  @ApiProperty({ enum: MANUAL_REASONS, example: StockAdjustmentReason.RESTOCK })
  @IsIn(MANUAL_REASONS as unknown as string[])
  reason!: StockAdjustmentReason

  @ApiProperty({ required: false, example: 'Received shipment #4821' })
  @IsOptional()
  @IsString()
  note?: string
}
