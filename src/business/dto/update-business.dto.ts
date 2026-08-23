import { ApiProperty } from '@nestjs/swagger'
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator'

/**
 * Update a business. Every property is optional and updated individually — the
 * frontend sends only the field(s) the user changed, not the whole object.
 */
export class UpdateBusinessDto {
  @ApiProperty({ required: false, example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @ApiProperty({
    required: false,
    type: [String],
    example: ['Retail', 'Wholesale'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[]

  @ApiProperty({
    required: false,
    example: 'We sell the finest widgets in town.',
  })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ required: false, example: 'Quality you can trust.' })
  @IsOptional()
  @IsString()
  tagLine?: string

  // Logo: send the fileUrl + fileKey returned by the file-storage presign step.
  @ApiProperty({
    required: false,
    example: 'https://cdn.example.com/logos/acme.png',
  })
  @IsOptional()
  @IsString()
  logo?: string

  @ApiProperty({ required: false, example: 'logos/acme.png' })
  @IsOptional()
  @IsString()
  logoKey?: string

  @ApiProperty({
    required: false,
    format: 'email',
    example: 'hello@acme.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiProperty({ required: false, example: '+1-555-123-4567' })
  @IsOptional()
  @IsString()
  phone?: string

  @ApiProperty({ required: false, example: 'https://acme.com' })
  @IsOptional()
  @IsString()
  website?: string

  @ApiProperty({ required: false, example: '123 Market St' })
  @IsOptional()
  @IsString()
  address?: string

  @ApiProperty({ required: false, example: 'San Francisco' })
  @IsOptional()
  @IsString()
  city?: string

  @ApiProperty({ required: false, example: 'CA' })
  @IsOptional()
  @IsString()
  state?: string

  @ApiProperty({ required: false, example: 'USA' })
  @IsOptional()
  @IsString()
  country?: string

  @ApiProperty({ required: false, example: '12-3456789' })
  @IsOptional()
  @IsString()
  taxId?: string

  @ApiProperty({ required: false, example: 'REG-2024-001' })
  @IsOptional()
  @IsString()
  registrationNumber?: string

  @ApiProperty({
    required: false,
    type: Object,
    example: {
      monday: { open: '09:00', close: '17:00' },
      tuesday: { open: '09:00', close: '17:00' },
    },
  })
  @IsOptional()
  @IsObject()
  businessHours?: Record<string, { open: string; close: string }>

  @ApiProperty({
    required: false,
    type: Object,
    example: {
      instagram: '@acme',
      tiktok: '@acme',
      website: 'https://acme.com',
    },
  })
  @IsOptional()
  @IsObject()
  socials?: Record<string, string>
}
