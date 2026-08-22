import { nanoid } from 'nanoid/non-secure';
import type { Provider } from '@nestjs/common';
import { IUser, UserRole } from '../user/domain/user.entity';
import {
  ICreateUser,
  IUpdateUser,
  USER_DATA_SOURCE,
  UserRepository,
} from '../user/domain/user.repository';
import {
  EMAIL_CHANGE_DATA_SOURCE,
  EmailChangeRepository,
  IPendingEmailChange,
} from '../user/domain/email-change.repository';
import { UserServiceV2 } from '../user/application/user.service';

/**
 * In-memory `UserRepository` for tests. Reproduces the Postgres entity's
 * write-time semantics: `create` assigns an id + 8-char shortId + column
 * defaults; `update` applies a patch where an explicit `null` clears a field and
 * an absent key is left untouched. Reads return copies so callers can't mutate
 * the store by reference.
 */
export class FakeUserRepository implements UserRepository {
  private readonly rows = new Map<string, IUser>();
  private seq = 0;

  findById(id: string): Promise<IUser | null> {
    const u = this.rows.get(id);
    return Promise.resolve(u ? { ...u } : null);
  }
  findByEmail(email: string): Promise<IUser | null> {
    const u = [...this.rows.values()].find((r) => r.email === email);
    return Promise.resolve(u ? { ...u } : null);
  }
  findByAppleId(appleId: string): Promise<IUser | null> {
    const u = [...this.rows.values()].find((r) => r.appleId === appleId);
    return Promise.resolve(u ? { ...u } : null);
  }
  list(): Promise<IUser[]> {
    // Newest first (insertion order proxies createdAt in the fake).
    return Promise.resolve(
      [...this.rows.values()].reverse().map((u) => ({ ...u })),
    );
  }
  create(data: ICreateUser): Promise<IUser> {
    const now = new Date();
    const user: IUser = {
      id: `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      shortId: nanoid(8),
      role: data.role ?? UserRole.OWNER,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      email: data.email,
      googleId: data.googleId ?? null,
      appleId: data.appleId ?? null,
      password: null,
      hashedRefreshToken: null,
      avatarUrl: data.avatarUrl ?? null,
      avatarKey: data.avatarKey ?? null,
      businessId: null,
      isSystem: false,
      isActive: true,
      isEmailVerified: data.isEmailVerified ?? false,
      deleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(user.id, user);
    return Promise.resolve({ ...user });
  }
  update(id: string, patch: IUpdateUser): Promise<IUser | null> {
    const existing = this.rows.get(id);
    if (!existing) return Promise.resolve(null);
    const merged = { ...existing, ...patch, updatedAt: new Date() };
    this.rows.set(id, merged);
    return Promise.resolve({ ...merged });
  }
  hardDelete(id: string): Promise<IUser | null> {
    const existing = this.rows.get(id);
    if (!existing) return Promise.resolve(null);
    this.rows.delete(id);
    return Promise.resolve({ ...existing });
  }

  // --- Test-only helpers (not part of the port) ---
  _clear(): void {
    this.rows.clear();
    this.seq = 0;
  }
  _get(id: string): IUser | undefined {
    return this.rows.get(id);
  }
  _count(predicate?: (u: IUser) => boolean): number {
    const all = [...this.rows.values()];
    return predicate ? all.filter(predicate).length : all.length;
  }
}

/**
 * Build the providers needed to inject a fake-backed `UserServiceV2` into a
 * test module, plus handles to the underlying fake stores for seeding/asserting.
 * The consuming module must also provide `MailService`, `FileStorageService`,
 * and `EventEmitter2` (e.g. via `EventEmitterModule.forRoot()`), which
 * `UserServiceV2` depends on.
 */
export function fakeUserServiceProviders(): {
  providers: Provider[];
  users: FakeUserRepository;
  emailChanges: FakeEmailChangeRepository;
} {
  const users = new FakeUserRepository();
  const emailChanges = new FakeEmailChangeRepository();
  return {
    users,
    emailChanges,
    providers: [
      UserServiceV2,
      { provide: USER_DATA_SOURCE, useValue: users },
      { provide: EMAIL_CHANGE_DATA_SOURCE, useValue: emailChanges },
    ],
  };
}

/** In-memory `EmailChangeRepository` for tests. */
export class FakeEmailChangeRepository implements EmailChangeRepository {
  readonly rows: IPendingEmailChange[] = [];

  deleteByUserId(userId: string): Promise<void> {
    let i = this.rows.length;
    while (i--) if (this.rows[i].userId === userId) this.rows.splice(i, 1);
    return Promise.resolve();
  }
  create(data: IPendingEmailChange): Promise<void> {
    this.rows.push({ ...data });
    return Promise.resolve();
  }
  _clear(): void {
    this.rows.length = 0;
  }
  findValid(
    userId: string,
    code: string,
    now: Date,
  ): Promise<IPendingEmailChange | null> {
    const found = this.rows.find(
      (r) => r.userId === userId && r.code === code && r.expiresAt > now,
    );
    return Promise.resolve(found ? { ...found } : null);
  }
}
