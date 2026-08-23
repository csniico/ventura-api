import { IAdmin } from '../domain/admin.entity'
import { AdminResponse } from '../responses/admin.response'

/** Project a domain `IAdmin` onto the public `AdminResponse` contract. */
export function toAdminResponse(admin: IAdmin): AdminResponse {
  return {
    id: admin.id,
    shortId: admin.shortId,
    name: admin.name,
    email: admin.email,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  }
}
