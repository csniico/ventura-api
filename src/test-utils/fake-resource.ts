import { nanoid } from 'nanoid/non-secure';
import type { Provider } from '@nestjs/common';
import { IResource, ResourceType } from '../resource/domain/resource.entity';
import {
  ICreateResource,
  IUpdateResource,
  ListResourcesOptions,
  RESOURCE_DATA_SOURCE,
  ResourceRepository,
} from '../resource/domain/resource.repository';
import { ResourceService } from '../resource/application/resource.service';

/**
 * In-memory `ResourceRepository` for tests. Reproduces the Postgres entity's
 * write-time semantics, business-scoped queries, and the atomic stock ops.
 */
export class FakeResourceRepository implements ResourceRepository {
  private readonly rows = new Map<string, IResource>();
  private seq = 0;

  create(data: ICreateResource): Promise<IResource> {
    const now = new Date();
    const resource: IResource = {
      id: `30000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      shortId: nanoid(8),
      businessId: data.businessId,
      type: data.type,
      name: data.name,
      price: data.price,
      primaryImage: data.primaryImage ?? null,
      primaryImageKey: data.primaryImageKey ?? null,
      supportingImages: data.supportingImages ?? [],
      supportingImageKeys: data.supportingImageKeys ?? [],
      description: data.description ?? null,
      notes: data.notes ?? null,
      availableQuantity: data.availableQuantity ?? 0,
      lowStockThreshold: data.lowStockThreshold ?? 5,
      businessHours: data.businessHours ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(resource.id, resource);
    return Promise.resolve({ ...resource });
  }
  findById(businessId: string, id: string): Promise<IResource | null> {
    const r = this.rows.get(id);
    return Promise.resolve(r && r.businessId === businessId ? { ...r } : null);
  }
  list(
    businessId: string,
    opts: ListResourcesOptions,
  ): Promise<{ data: IResource[]; total: number }> {
    let rows = [...this.rows.values()].filter(
      (r) => r.businessId === businessId,
    );
    if (opts.type) rows = rows.filter((r) => r.type === opts.type);
    const q = opts.q?.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    rows.reverse(); // newest first
    const total = rows.length;
    const data = rows
      .slice(opts.skip, opts.skip + opts.limit)
      .map((r) => ({ ...r }));
    return Promise.resolve({ data, total });
  }
  update(
    businessId: string,
    id: string,
    patch: IUpdateResource,
  ): Promise<IResource | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.businessId !== businessId) {
      return Promise.resolve(null);
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    const merged = { ...existing, ...clean, updatedAt: new Date() };
    this.rows.set(id, merged);
    return Promise.resolve({ ...merged });
  }
  delete(businessId: string, id: string): Promise<IResource | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.businessId !== businessId) {
      return Promise.resolve(null);
    }
    this.rows.delete(id);
    return Promise.resolve({ ...existing });
  }
  decrementStock(
    businessId: string,
    id: string,
    quantity: number,
  ): Promise<boolean> {
    const r = this.rows.get(id);
    if (
      !r ||
      r.businessId !== businessId ||
      r.type !== ResourceType.PRODUCT ||
      r.availableQuantity < quantity
    ) {
      return Promise.resolve(false);
    }
    r.availableQuantity -= quantity;
    r.updatedAt = new Date();
    return Promise.resolve(true);
  }
  incrementStock(
    businessId: string,
    id: string,
    quantity: number,
  ): Promise<void> {
    const r = this.rows.get(id);
    if (r && r.businessId === businessId && r.type === ResourceType.PRODUCT) {
      r.availableQuantity += quantity;
      r.updatedAt = new Date();
    }
    return Promise.resolve();
  }
  countLowStock(businessId: string): Promise<number> {
    const n = [...this.rows.values()].filter(
      (r) =>
        r.businessId === businessId &&
        r.type === ResourceType.PRODUCT &&
        r.availableQuantity <= r.lowStockThreshold,
    ).length;
    return Promise.resolve(n);
  }

  // --- Test-only helpers (not part of the port) ---
  _clear(): void {
    this.rows.clear();
    this.seq = 0;
  }
  _get(id: string): IResource | undefined {
    return this.rows.get(id);
  }
  _count(): number {
    return this.rows.size;
  }
}

/**
 * Providers for a fake-backed `ResourceService` plus a handle to the fake store.
 * The consuming module must also provide `FileStorageService` (ResourceService
 * depends on it for image cleanup).
 */
export function fakeResourceServiceProviders(): {
  providers: Provider[];
  resources: FakeResourceRepository;
} {
  const resources = new FakeResourceRepository();
  return {
    resources,
    providers: [
      ResourceService,
      { provide: RESOURCE_DATA_SOURCE, useValue: resources },
    ],
  };
}
