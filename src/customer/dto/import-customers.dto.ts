import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto';

/**
 * Bulk import customers (e.g. contacts selected from a phone's address book on
 * iOS/Android). Each entry is validated individually.
 */
export class ImportCustomersDto {
  @ApiProperty({ type: [CreateCustomerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerDto)
  customers!: CreateCustomerDto[];
}
