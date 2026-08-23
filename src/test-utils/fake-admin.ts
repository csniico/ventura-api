import type { Provider } from '@nestjs/common'
import { nanoid } from 'nanoid/non-secure'
import { AdminProfileService } from '../admin/application/admin-profile.service'
import { IAdmin } from '../admin/domain/admin.entity'
import {
  ADMIN_DATA_SOURCE,
  AdminRepository,
  ICreateAdmin,
  IUpdateAdmin,
} from '../admin/domain/admin.repository'

/**
 * In-memory `AdminRepository` for tests. Reproduces the Postgres entity's
 * write-time semantics (generated id/shortId, unique email lookups) without a
 * database.
 */
export class FakeAdminRepository implements AdminRepository {
  private readonly rows = new Map<string, IAdmin>()
  private seq = 0

  create(data: ICreateAdmin): Promise<IAdmin> {
    const now = new Date()
    const admin: IAdmin = {
      id: `70000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      shortId: nanoid(8),
      name: data.name,
      email: data.email,
      createdAt: now,
      updatedAt: now,
    }
    this.rows.set(admin.id, admin)
    return Promise.resolve({ ...admin })
  }
  findById(id: string): Promise<IAdmin | null> {
    const a = this.rows.get(id)
    return Promise.resolve(a ? { ...a } : null)
  }
  findByEmail(email: string): Promise<IAdmin | null> {
    const a = [...this.rows.values()].find((r) => r.email === email)
    return Promise.resolve(a ? { ...a } : null)
  }
  update(id: string, patch: IUpdateAdmin): Promise<IAdmin | null> {
    const existing = this.rows.get(id)
    if (!existing) return Promise.resolve(null)
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    )
    const merged = { ...existing, ...clean, updatedAt: new Date() }
    this.rows.set(id, merged)
    return Promise.resolve({ ...merged })
  }

  // --- Test-only helpers (not part of the port) ---
  _clear(): void {
    this.rows.clear()
    this.seq = 0
  }
  _get(id: string): IAdmin | undefined {
    return this.rows.get(id)
  }
  _count(): number {
    return this.rows.size
  }
}

/**
 * Providers for a fake-backed `AdminProfileService` plus a handle to the fake
 * store.
 */
export function fakeAdminServiceProviders(): {
  providers: Provider[]
  admins: FakeAdminRepository
} {
  const admins = new FakeAdminRepository()
  return {
    admins,
    providers: [
      AdminProfileService,
      { provide: ADMIN_DATA_SOURCE, useValue: admins },
    ],
  }
}
