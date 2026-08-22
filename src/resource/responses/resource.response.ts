import { ApiProperty } from '@nestjs/swagger';
import { ResourceType } from '../domain/resource.entity';

/** Public shape of a Resource returned by the API. */
export class ResourceResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  id!: string;

  @ApiProperty({ example: 'aB3xY9kP' })
  shortId!: string;

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  businessId!: string;

  @ApiProperty({ enum: ResourceType, example: ResourceType.PRODUCT })
  type!: ResourceType;

  @ApiProperty({ example: 'Espresso Beans 1kg' })
  name!: string;

  @ApiProperty({ example: 9.99 })
  price!: number;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'https://example.com/images/primary.png',
  })
  primaryImage?: string | null;

  @ApiProperty({
    type: [String],
    example: ['https://example.com/images/1.png'],
  })
  supportingImages!: string[];

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'uploads/abc123.png',
  })
  primaryImageKey?: string | null;

  @ApiProperty({
    type: [String],
    example: ['uploads/abc123.png'],
  })
  supportingImageKeys!: string[];

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Single-origin medium roast.',
  })
  description?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Store in a cool, dry place.',
  })
  notes?: string | null;

  @ApiProperty({ example: 100 })
  availableQuantity!: number;

  @ApiProperty({ example: 5 })
  lowStockThreshold!: number;

  @ApiProperty({
    type: Object,
    required: false,
    nullable: true,
    example: { monday: { open: '09:00', close: '17:00' } },
  })
  businessHours?: Record<string, { open: string; close: string }> | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
