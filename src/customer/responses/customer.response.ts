import { ApiProperty } from '@nestjs/swagger';

/** Public shape of a Customer returned by the API. */
export class CustomerResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  id!: string;

  @ApiProperty({ example: 'aB3xY9kP' })
  shortId!: string;

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  businessId!: string;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    format: 'email',
    example: 'jane@example.com',
  })
  email?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '+1-555-987-6543' })
  phone?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Prefers email contact.',
  })
  notes?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/** Per-row report returned by the bulk customer import endpoint. */
export class BulkImportResultResponse {
  @ApiProperty({ type: [CustomerResponse] })
  created!: CustomerResponse[];

  @ApiProperty({
    type: Object,
    isArray: true,
    example: [{ index: 2, reason: 'Duplicate email.' }],
  })
  skipped!: { index: number; reason: string }[];

  @ApiProperty({
    type: Object,
    isArray: true,
    example: [{ index: 5, reason: 'Validation failed.' }],
  })
  failed!: { index: number; reason: string }[];
}
