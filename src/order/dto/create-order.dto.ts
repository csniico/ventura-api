import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator'

/** A requested line item: which resource, how many, and (optionally) in what
 * unit. Omit `unit` to order in the product's base unit. */
export class CreateOrderItemDto {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  @IsString()
  @IsNotEmpty()
  resourceId!: string

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity!: number

  @ApiProperty({
    required: false,
    example: 'carton',
    description:
      'A bulk unit defined on the product; defaults to the base unit.',
  })
  @IsOptional()
  @IsString()
  unit?: string
}

export class CreateOrderDto {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  @IsString()
  @IsNotEmpty()
  customerId!: string

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[]
}
