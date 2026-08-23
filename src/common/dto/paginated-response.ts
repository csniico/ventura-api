import { Type } from '@nestjs/common'
import { ApiProperty, getSchemaPath } from '@nestjs/swagger'
import { PaginationMeta } from './paginated'

/**
 * Build a concrete Swagger response class for a paginated list of `model`,
 * i.e. `{ data: model[]; meta: PaginationMeta }`. NestJS Swagger can't express
 * generics, so we synthesize a named class per model.
 */
export function paginatedResponse<TModel extends Type<unknown>>(
  model: TModel,
): Type<unknown> {
  class PaginatedDto {
    @ApiProperty({ type: model, isArray: true })
    data!: unknown[]

    @ApiProperty({ type: PaginationMeta })
    meta!: PaginationMeta
  }
  // Give the generated class a stable, unique name in the spec.
  Object.defineProperty(PaginatedDto, 'name', {
    value: `Paginated${model.name}`,
  })
  return PaginatedDto
}

// Re-export so callers can reference the path if needed.
export { getSchemaPath }
