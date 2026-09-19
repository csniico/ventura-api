import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator'

/** An alternate bulk/retail unit for a product (base unit is implicit). */
export class ResourceUnitDto {
  @ApiProperty({ example: 'carton' })
  @IsString()
  @IsNotEmpty()
  name!: string

  @ApiProperty({
    example: 24,
    description: 'How many base units one of this unit equals (>= 1).',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(1)
  factor!: number

  @ApiProperty({ example: 45.0, description: 'Price for one of this unit.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number
}
