import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

// Names: letters (any language), spaces, and . ' - (for initials, O'Brien,
// Jean-Luc). No digits or other symbols. Phones: digits with optional +, spaces,
// parentheses and hyphens; 7-20 chars. Applied to single create/update only —
// bulk import stays lenient (see ImportCustomerDto) so a contact import doesn't
// fail wholesale on one odd row.
export const NAME_PATTERN = /^[\p{L}][\p{L} .'’-]*$/u;
export const PHONE_PATTERN = /^[+]?[\d\s()-]{7,20}$/;

/** A single customer. Only `name` is required. */
export class CreateCustomerDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  @Matches(NAME_PATTERN, {
    message: 'Name may only contain letters, spaces, hyphens and apostrophes.',
  })
  name!: string;

  @ApiProperty({
    required: false,
    format: 'email',
    example: 'jane@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: '+1-555-987-6543' })
  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'Enter a valid phone number.' })
  phone?: string;

  @ApiProperty({ required: false, example: 'Prefers email contact.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
