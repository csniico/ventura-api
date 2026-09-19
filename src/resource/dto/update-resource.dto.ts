import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator'
import { ResourceUnitDto } from './resource-unit.dto'

/**
 * Update a resource. Every field is optional and applied individually.
 * `type` is intentionally not updatable — a product cannot become a service.
 */
export class UpdateResourceDto {
  @ApiProperty({ required: false, example: 'Espresso Beans 1kg' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @ApiProperty({ required: false, example: 9.99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number

  @ApiProperty({
    required: false,
    example: 'https://example.com/images/primary.png',
  })
  @IsOptional()
  @IsString()
  primaryImage?: string

  @ApiProperty({
    required: false,
    type: [String],
    example: ['https://example.com/images/1.png'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportingImages?: string[]

  @ApiProperty({
    required: false,
    example: 'uploads/abc123.png',
  })
  @IsOptional()
  @IsString()
  primaryImageKey?: string

  @ApiProperty({
    required: false,
    type: [String],
    example: ['uploads/abc123.png'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportingImageKeys?: string[]

  @ApiProperty({ required: false, example: 'Single-origin medium roast.' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ required: false, example: 'Store in a cool, dry place.' })
  @IsOptional()
  @IsString()
  notes?: string

  // Product-only.
  @ApiProperty({ required: false, example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  availableQuantity?: number

  // Product-only: reorder point for low-stock alerts.
  @ApiProperty({ required: false, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number

  // Product-only: label for the unit stock is counted in.
  @ApiProperty({ required: false, example: 'piece' })
  @IsOptional()
  @IsString()
  baseUnit?: string

  // Product-only: alternate bulk units for sale/purchase.
  @ApiProperty({ required: false, type: [ResourceUnitDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceUnitDto)
  units?: ResourceUnitDto[]

  // Service-only.
  @ApiProperty({
    type: Object,
    required: false,
    example: { monday: { open: '09:00', close: '17:00' } },
  })
  @IsOptional()
  @IsObject()
  businessHours?: Record<string, { open: string; close: string }>
}
