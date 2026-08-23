import { ApiProperty } from '@nestjs/swagger'

/** Standard metadata for a paginated response. */
export class PaginationMeta {
  @ApiProperty({ example: 137 })
  total!: number

  @ApiProperty({ example: 1 })
  page!: number

  @ApiProperty({ example: 20 })
  limit!: number

  @ApiProperty({ example: 7 })
  totalPages!: number
}

/** A page of results plus pagination metadata. */
export interface Paginated<T> {
  data: T[]
  meta: PaginationMeta
}

/** Normalize raw page/limit inputs to safe values (defaults + clamps). */
export function normalizePaging(
  page?: number,
  limit?: number,
): {
  page: number
  limit: number
  skip: number
} {
  const safePage = page && page > 0 ? Math.floor(page) : 1
  const safeLimit = limit && limit > 0 ? Math.min(Math.floor(limit), 100) : 20
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit }
}

/** Build a Paginated envelope from a page of data and the total count. */
export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }
}
