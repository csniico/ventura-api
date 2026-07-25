import { IAdmin } from '../domain/admin.entity';
import { AdminResponse } from '../responses/admin.response';

/**
 * Project a domain `IAdmin` onto the public `AdminResponse` contract. Maps the
 * Postgres `id` to `_id` so the payload stays shape-compatible with the legacy
 * Mongo response.
 */
export function toAdminResponse(admin: IAdmin): AdminResponse {
  return {
    _id: admin.id,
    shortId: admin.shortId,
    name: admin.name,
    email: admin.email,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}
