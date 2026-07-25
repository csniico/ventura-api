/**
 * Domain contract for a platform admin. Mirrors the public API shape
 * (see `AdminResponse`). Admins are global (not business-scoped); email is
 * unique across the table.
 */
export interface IAdmin {
  id: string;
  shortId: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}
