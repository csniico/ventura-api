import { IAdmin } from './admin.entity'

/** Fields accepted when creating an admin. */
export interface ICreateAdmin {
  name: string
  email: string
}

/** Partial patch applied to an existing admin. Only present keys are written. */
export interface IUpdateAdmin {
  name?: string
}

/**
 * Data-access boundary for platform admins. Admins are global (not
 * business-scoped). Business rules (email-idempotent create, not-found
 * handling) live in the service.
 */
export interface AdminRepository {
  create(data: ICreateAdmin): Promise<IAdmin>
  /** Get an admin by id, or null. */
  findById(id: string): Promise<IAdmin | null>
  /** Get an admin by email, or null. */
  findByEmail(email: string): Promise<IAdmin | null>
  /** Apply a patch to an admin. Null if none. */
  update(id: string, patch: IUpdateAdmin): Promise<IAdmin | null>
}

// Token for Nest DI (interfaces have no runtime representation to bind against).
export const ADMIN_DATA_SOURCE = Symbol('ADMIN_DATA_SOURCE')
