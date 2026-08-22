import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ImportCustomerDto } from './import-customer.dto';

/**
 * Bulk import customers (e.g. contacts selected from a phone's address book on
 * iOS/Android). Each entry is validated individually against the lenient
 * [ImportCustomerDto] (email still checked); duplicates are skipped by the
 * service and reported per row.
 */
export class ImportCustomersDto {
  @ApiProperty({ type: [ImportCustomerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportCustomerDto)
  customers!: ImportCustomerDto[];
}
