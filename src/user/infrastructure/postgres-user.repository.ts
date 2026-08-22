import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { IUser } from '../domain/user.entity';
import {
  ICreateUser,
  IUpdateUser,
  UserRepository,
} from '../domain/user.repository';
import {
  PostgresUser,
  PostgresUserEntity,
} from '../domain/postgres.user-entity';

@Injectable()
export class PostgresUserRepository implements UserRepository {
  constructor(private readonly em: EntityManager) {}

  /**
   * Map a managed MikroORM entity to the `IUser` domain shape. The columns line
   * up 1:1 with `IUser`; the explicit projection documents the boundary and
   * detaches the result from the identity map.
   */
  private toDomain(entity: PostgresUser): IUser {
    return {
      id: entity.id,
      shortId: entity.shortId,
      role: entity.role,
      firstName: entity.firstName,
      lastName: entity.lastName,
      email: entity.email,
      googleId: entity.googleId,
      appleId: entity.appleId,
      password: entity.password,
      hashedRefreshToken: entity.hashedRefreshToken,
      avatarUrl: entity.avatarUrl,
      avatarKey: entity.avatarKey,
      businessId: entity.businessId,
      isSystem: entity.isSystem,
      isActive: entity.isActive,
      isEmailVerified: entity.isEmailVerified,
      deleted: entity.deleted,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async findById(id: string): Promise<IUser | null> {
    const user = await this.em.findOne(PostgresUserEntity, { id });
    return user ? this.toDomain(user) : null;
  }

  async findByEmail(email: string): Promise<IUser | null> {
    const user = await this.em.findOne(PostgresUserEntity, { email });
    return user ? this.toDomain(user) : null;
  }

  async findByAppleId(appleId: string): Promise<IUser | null> {
    const user = await this.em.findOne(PostgresUserEntity, { appleId });
    return user ? this.toDomain(user) : null;
  }

  async list(): Promise<IUser[]> {
    const users = await this.em.find(
      PostgresUserEntity,
      {},
      { orderBy: { createdAt: 'DESC' } },
    );
    return users.map((u) => this.toDomain(u));
  }

  async create(data: ICreateUser): Promise<IUser> {
    const user = this.em.create(PostgresUserEntity, data);
    await this.em.flush();
    return this.toDomain(user);
  }

  async update(id: string, patch: IUpdateUser): Promise<IUser | null> {
    const user = await this.em.findOne(PostgresUserEntity, { id });
    if (!user) {
      return null;
    }
    // `assign` only touches keys present in `patch`: an explicit null clears the
    // column, an absent key is left untouched.
    this.em.assign(user, patch);
    await this.em.flush();
    return this.toDomain(user);
  }

  async hardDelete(id: string): Promise<IUser | null> {
    const user = await this.em.findOne(PostgresUserEntity, { id });
    if (!user) {
      return null;
    }
    const removed = this.toDomain(user);
    await this.em.nativeDelete(PostgresUserEntity, { id });
    return removed;
  }
}
