/** Escape a user string for safe use inside a RegExp (search queries). */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
