import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';

import { MailService } from '../mail/mail.service';
import { UserServiceV2 } from '../user/application/user.service';
import { UserEvents } from '../user/events/user.events';
import { AdminProfileService } from './application/admin-profile.service';
import { AdminManageUsersService } from './services/admin.manage-users.service';
import { mockFileStorageProvider } from '../test-utils/file-storage.mock';
import {
  FakeUserRepository,
  fakeUserServiceProviders,
} from '../test-utils/fake-user';
import {
  FakeAdminRepository,
  fakeAdminServiceProviders,
} from '../test-utils/fake-admin';

describe('Admin module', () => {
  let moduleRef: TestingModule;
  let profileService: AdminProfileService;
  let manageUsers: AdminManageUsersService;
  let users: UserServiceV2;
  let usersFake: FakeUserRepository;
  let adminsFake: FakeAdminRepository;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    // Both admins and users are Postgres-backed via in-memory fakes.
    const fakeUsers = fakeUserServiceProviders();
    usersFake = fakeUsers.users;
    const fakeAdmins = fakeAdminServiceProviders();
    adminsFake = fakeAdmins.admins;

    moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        ...fakeAdmins.providers,
        AdminManageUsersService,
        ...fakeUsers.providers,
        mockFileStorageProvider,
        { provide: MailService, useValue: { sendVerificationCode: jest.fn() } },
      ],
    }).compile();

    profileService = moduleRef.get(AdminProfileService);
    manageUsers = moduleRef.get(AdminManageUsersService);
    users = moduleRef.get(UserServiceV2);
    eventEmitter = moduleRef.get<EventEmitter2>(EventEmitter2);
  });

  beforeEach(() => {
    adminsFake._clear();
    usersFake._clear();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  describe('AdminProfileService', () => {
    it('creates an admin and reads it back', async () => {
      const admin = await profileService.create({
        name: 'Boss',
        email: 'boss@example.com',
      });
      expect(admin.id).toBeDefined();
      expect(admin.shortId).toHaveLength(8);

      const fromDb = await profileService.getById(admin.id);
      expect(fromDb.name).toBe('Boss');
      expect(fromDb.email).toBe('boss@example.com');
    });

    it('returns the existing admin on duplicate email', async () => {
      const first = await profileService.create({
        name: 'Boss',
        email: 'dupe@example.com',
      });
      const second = await profileService.create({
        name: 'Other',
        email: 'dupe@example.com',
      });
      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Boss');
      expect(adminsFake._count()).toBe(1);
    });

    it('getById throws NotFound for a missing admin', async () => {
      await expect(
        profileService.getById('00000000-0000-4000-8000-999999999999'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the admin name', async () => {
      const admin = await profileService.create({
        name: 'Boss',
        email: 'upd@example.com',
      });
      await profileService.updateProfile(admin.id, { name: 'New Boss' });

      const fromDb = await profileService.getById(admin.id);
      expect(fromDb.name).toBe('New Boss');
    });

    it('updateProfile throws NotFound for a missing admin', async () => {
      await expect(
        profileService.updateProfile('00000000-0000-4000-8000-999999999999', {
          name: 'X',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('AdminManageUsersService', () => {
    const MISSING = '00000000-0000-4000-8000-999999999999';

    async function seedUser(email: string) {
      return users.createWithEmail({ firstName: 'U', email });
    }

    it('lists users newest first', async () => {
      await seedUser('a@example.com');
      await seedUser('b@example.com');

      const list = await manageUsers.listUsers();
      expect(list).toHaveLength(2);
    });

    it('gets a user by id (via UserService)', async () => {
      const u = await seedUser('get@example.com');
      const found = await manageUsers.getUserById(u.id);
      expect(found.email).toBe('get@example.com');
    });

    it('soft-deletes (via UserService) and restores a user, emitting user.restored', async () => {
      const u = await seedUser('soft@example.com');
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      await manageUsers.softDeleteUser(u.id);
      expect(usersFake._get(u.id)?.deleted).toBe(true);
      expect(usersFake._get(u.id)?.deletedAt).toBeInstanceOf(Date);

      emitSpy.mockClear();
      await manageUsers.restoreUser(u.id);
      expect(usersFake._get(u.id)?.deleted).toBe(false);
      expect(usersFake._get(u.id)?.deletedAt == null).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith(
        UserEvents.RESTORED,
        expect.objectContaining({ userId: u.id }),
      );

      emitSpy.mockRestore();
    });

    it('restoring a non-deleted user is a no-op and emits nothing', async () => {
      const u = await seedUser('noop-restore@example.com');
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      await manageUsers.restoreUser(u.id);
      expect(emitSpy).not.toHaveBeenCalled();

      emitSpy.mockRestore();
    });

    it('restoreUser throws NotFound when the user does not exist', async () => {
      await expect(manageUsers.restoreUser(MISSING)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('hard-deletes a user permanently and emits user.permanently_deleted', async () => {
      const u = await seedUser('hard@example.com');
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      const removed = await manageUsers.hardDeleteUser(u.id);
      expect(removed?.email).toBe('hard@example.com');

      expect(usersFake._get(u.id)).toBeUndefined();
      expect(usersFake._count()).toBe(0);

      expect(emitSpy).toHaveBeenCalledWith(
        UserEvents.PERMANENTLY_DELETED,
        expect.objectContaining({ userId: u.id }),
      );

      emitSpy.mockRestore();
    });

    it('hard-delete returns null and emits nothing when the user does not exist', async () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      const removed = await manageUsers.hardDeleteUser(MISSING);
      expect(removed).toBeNull();
      expect(emitSpy).not.toHaveBeenCalled();

      emitSpy.mockRestore();
    });
  });
});
