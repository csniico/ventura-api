import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Create a business. The frontend creates with a name and an optional list of
 * categories only; every other property is set later via individual updates.
 * `ownerId` is NOT accepted here — it comes from the authenticated user.
 */
export class CreateBusinessDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['Retail', 'Wholesale'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}
