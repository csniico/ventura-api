/** Opening hours keyed by weekday, e.g. `{ monday: { open: '09:00', close: '17:00' } }`. */
export type BusinessHours = Record<string, { open: string; close: string }>;

/** Social links keyed by platform (instagram, tiktok, facebook, x, linkedin, website). */
export type Socials = Record<string, string>;

/**
 * Domain contract for a business. Mirrors the public API shape
 * (see `BusinessResponse`). `ownerId` is a plain `user.id` string (no populate).
 * Persistence-nullable columns surface here as optional (`?`) and may be `null`.
 */
export interface IBusiness {
  id: string;
  shortId: string;
  name: string;
  ownerId: string;
  categories: string[];
  description?: string | null;
  tagLine?: string | null;
  logo?: string | null;
  logoKey?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  businessHours?: BusinessHours | null;
  socials: Socials;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
