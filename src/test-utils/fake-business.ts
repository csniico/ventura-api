import { nanoid } from 'nanoid/non-secure';
import { IBusiness } from '../business/domain/business.entity';
import {
  BusinessRepository,
  ICreateBusiness,
  IUpdateBusiness,
} from '../business/domain/business.repository';

/**
 * In-memory `BusinessRepository` for tests. Reproduces the Postgres entity's
 * write-time semantics: `create` assigns an id + 8-char shortId + column
 * defaults; `update` applies a patch where only present keys are written.
 */
export class FakeBusinessRepository implements BusinessRepository {
  private readonly rows = new Map<string, IBusiness>();
  private seq = 0;

  findById(id: string): Promise<IBusiness | null> {
    const b = this.rows.get(id);
    return Promise.resolve(b ? { ...b } : null);
  }
  findByOwner(ownerId: string): Promise<IBusiness | null> {
    const b = [...this.rows.values()].find((r) => r.ownerId === ownerId);
    return Promise.resolve(b ? { ...b } : null);
  }
  create(data: ICreateBusiness): Promise<IBusiness> {
    const now = new Date();
    const business: IBusiness = {
      id: `10000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      shortId: nanoid(8),
      name: data.name,
      ownerId: data.ownerId,
      categories: data.categories,
      description: null,
      tagLine: null,
      logo: null,
      logoKey: null,
      email: null,
      phone: null,
      website: null,
      address: null,
      city: null,
      state: null,
      country: null,
      taxId: null,
      registrationNumber: null,
      businessHours: null,
      socials: data.socials,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(business.id, business);
    return Promise.resolve({ ...business });
  }
  update(id: string, patch: IUpdateBusiness): Promise<IBusiness | null> {
    const existing = this.rows.get(id);
    if (!existing) return Promise.resolve(null);
    // Mirror the Postgres repo: undefined-valued keys are ignored.
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    const merged = { ...existing, ...clean, updatedAt: new Date() };
    this.rows.set(id, merged);
    return Promise.resolve({ ...merged });
  }
  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  // --- Test-only helpers (not part of the port) ---
  _clear(): void {
    this.rows.clear();
    this.seq = 0;
  }
  _get(id: string): IBusiness | undefined {
    return this.rows.get(id);
  }
  _count(): number {
    return this.rows.size;
  }
}
