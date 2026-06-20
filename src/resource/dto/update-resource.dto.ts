import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Update a resource. Every field is optional and applied individually.
 * `type` is intentionally not updatable — a product cannot become a service.
 */
export class UpdateResourceDto {
  @ApiProperty({ required: false, example: 'Espresso Beans 1kg' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({ required: false, example: 9.99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiProperty({
    required: false,
    example: 'https://example.com/images/primary.png',
  })
  @IsOptional()
  @IsString()
  primaryImage?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['https://example.com/images/1.png'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportingImages?: string[];

  @ApiProperty({
    required: false,
    example: 'uploads/abc123.png',
  })
  @IsOptional()
  @IsString()
  primaryImageKey?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['uploads/abc123.png'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportingImageKeys?: string[];

  @ApiProperty({ required: false, example: 'Single-origin medium roast.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, example: 'Store in a cool, dry place.' })
  @IsOptional()
  @IsString()
  notes?: string;

  // Product-only.
  @ApiProperty({ required: false, example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  availableQuantity?: number;

  // Product-only: reorder point for low-stock alerts.
  @ApiProperty({ required: false, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  // Service-only.
  @ApiProperty({
    type: Object,
    required: false,
    example: { monday: { open: '09:00', close: '17:00' } },
  })
  @IsOptional()
  @IsObject()
  businessHours?: Record<string, { open: string; close: string }>;
}
