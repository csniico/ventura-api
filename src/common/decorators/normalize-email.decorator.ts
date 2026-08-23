import { Transform } from 'class-transformer'

/**
 * Canonicalizes an email field during DTO transformation: trims surrounding
 * whitespace and lowercases it. Apply alongside `@IsEmail()` on every incoming
 * email field.
 *
 * Email addresses are case-insensitive in practice, but Mongo's unique index is
 * case-sensitive — so without this, `Ada@Example.com` and `ada@example.com`
 * become two separate accounts. Normalizing here guarantees a single canonical
 * record regardless of how the user typed (or how a provider returned) it.
 */
export const NormalizeEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
