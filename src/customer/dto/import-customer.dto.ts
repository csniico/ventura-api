import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * A single row in a bulk import. Intentionally more lenient than
 * [CreateCustomerDto]: it does NOT enforce the strict name/phone character
 * rules, because contacts imported from a phone address book often contain
 * digits or symbols in the name, and we'd rather import them (or skip per-row)
 * than fail the whole batch. Email is still validated so genuinely malformed
 * addresses are reported per row.
 */
export class ImportCustomerDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ required: false, format: 'email', example: 'jane@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: '+1-555-987-6543' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false, example: 'Prefers email contact.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
