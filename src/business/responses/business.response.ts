import { ApiProperty } from '@nestjs/swagger';

/** Public shape of a Business returned by the API. */
export class BusinessResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  id!: string;

  @ApiProperty({ example: 'aB3xY9kP' })
  shortId!: string;

  @ApiProperty({ example: 'Acme Corp' })
  name!: string;

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  ownerId!: string;

  @ApiProperty({ type: [String], example: ['Retail', 'Wholesale'] })
  categories!: string[];

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'We sell the finest widgets in town.',
  })
  description?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Quality you can trust.',
  })
  tagLine?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'https://cdn.example.com/logos/acme.png',
  })
  logo?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'logos/acme.png' })
  logoKey?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    format: 'email',
    example: 'hello@acme.com',
  })
  email?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '+1-555-123-4567' })
  phone?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'https://acme.com',
  })
  website?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '123 Market St' })
  address?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'San Francisco' })
  city?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'CA' })
  state?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'USA' })
  country?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '12-3456789' })
  taxId?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'REG-2024-001' })
  registrationNumber?: string | null;

  @ApiProperty({
    type: Object,
    required: false,
    nullable: true,
    example: {
      monday: { open: '09:00', close: '17:00' },
      tuesday: { open: '09:00', close: '17:00' },
    },
  })
  businessHours?: Record<string, { open: string; close: string }> | null;

  @ApiProperty({
    type: Object,
    required: false,
    example: { instagram: '@acme', website: 'https://acme.com' },
  })
  socials!: Record<string, string>;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
