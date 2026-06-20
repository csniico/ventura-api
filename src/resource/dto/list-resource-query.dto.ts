import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ResourceType } from '../schemas/resource.schema';

/** Query params for listing resources: pagination/search plus a type filter. */
export class ListResourceQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: false, enum: ResourceType })
  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;
}
