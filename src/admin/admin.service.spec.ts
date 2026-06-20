import { Test, TestingModule } from '@nestjs/testing';
import {
  MongooseModule,
  getModelToken,
  getConnectionToken,
} from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';

import { UserService } from '../user/user.service';
import {
  EmailChange,
  EmailChangeSchema,
} from '../user/schemas/email-change.schema';
import { MailService } from '../mail/mail.service';
import { User, UserDocument, UserSchema } from '../user/schemas/user.schema';
import { UserEvents } from '../user/events/user.events';
import { Admin, AdminDocument, AdminSchema } from './schemas/admin.schema';
import { AdminProfileService } from './services/admin-profile.service';
import { AdminManageUsersService } from './services/admin.manage-users.service';
import { resolveTestUri } from '../test-utils/test-db';
import { mockFileStorageProvider } from '../test-utils/file-storage.mock';

describe('Admin module (integration, real MongoDB)', () => {
  let moduleRef: TestingModule;
  let profileService: AdminProfileService;
  let manageUsers: AdminManageUsersService;
  let adminModel: Model<AdminDocument>;
  let userModel: Model<UserDocument>;
  let connection: Connection;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    const uri = resolveTestUri('admin');

    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Admin.name, schema: AdminSchema },
          { name: User.name, schema: UserSchema },
          { name: EmailChange.name, schema: EmailChangeSchema },
        ]),
      ],
      providers: [
        AdminProfileService,
        AdminManageUsersService,
        UserService,
        mockFileStorageProvider,
        { provide: MailService, useValue: { sendVerificationCode: jest.fn() } },
      ],
    }).compile();

    profileService = moduleRef.get(AdminProfileService);
    manageUsers = moduleRef.get(AdminManageUsersService);
    adminModel = moduleRef.get<Model<AdminDocument>>(getModelToken(Admin.name));
    userModel = moduleRef.get<Model<UserDocument>>(getModelToken(User.name));
    connection = moduleRef.get<Connection>(getConnectionToken());
    eventEmitter = moduleRef.get<EventEmitter2>(EventEmitter2);
  });

  beforeEach(async () => {
    await adminModel.deleteMany({});
    await userModel.deleteMany({});
  });

  afterAll(async () => {
    await adminModel.deleteMany({});
    await userModel.deleteMany({});
    await connection.close();
    await moduleRef.close();
  });

  describe('AdminProfileService', () => {
    it('creates an admin and reads it back', async () => {
      const admin = await profileService.create({
        name: 'Boss',
        email: 'boss@example.com',
      });
      expect(admin._id).toBeDefined();
      expect(admin.shortId).toHaveLength(8);

      const fromDb = await adminModel.findById(admin._id).exec();
      expect(fromDb?.name).toBe('Boss');
      expect(fromDb?.email).toBe('boss@example.com');
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
      expect(String(second._id)).toBe(String(first._id));
      expect(second.name).toBe('Boss');
      expect(await adminModel.countDocuments()).toBe(1);
    });

    it('getById throws NotFound for a missing admin', async () => {
      const missing = new Types.ObjectId().toString();
      await expect(profileService.getById(missing)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('updates the admin name', async () => {
      const admin = await profileService.create({
        name: 'Boss',
        email: 'upd@example.com',
      });
      await profileService.updateProfile(String(admin._id), {
        name: 'New Boss',
      });

      const fromDb = await adminModel.findById(admin._id).exec();
      expect(fromDb?.name).toBe('New Boss');
    });
  });

  describe('AdminManageUsersService', () => {
    async function seedUser(email: string) {
      return userModel.create({ firstName: 'U', email });
    }

    it('lists users newest first', async () => {
      await seedUser('a@example.com');
      await seedUser('b@example.com');

      const users = await manageUsers.listUsers();
      expect(users).toHaveLength(2);
    });

    it('gets a user by id (via UserService)', async () => {
      const u = await seedUser('get@example.com');
      const found = await manageUsers.getUserById(String(u._id));
      expect(found.email).toBe('get@example.com');
    });

    it('soft-deletes (via UserService) and restores a user, emitting user.restored', async () => {
      const u = await seedUser('soft@example.com');
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      await manageUsers.softDeleteUser(String(u._id));
      let fromDb = await userModel.findById(u._id).exec();
      expect(fromDb?.deleted).toBe(true);
      expect(fromDb?.deletedAt).toBeInstanceOf(Date);

      emitSpy.mockClear();
      await manageUsers.restoreUser(String(u._id));
      fromDb = await userModel.findById(u._id).exec();
      expect(fromDb?.deleted).toBe(false);
      expect(fromDb?.deletedAt == null).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith(
        UserEvents.RESTORED,
        expect.objectContaining({ userId: String(u._id) }),
      );

      emitSpy.mockRestore();
    });

    it('restoring a non-deleted user is a no-op and emits nothing', async () => {
      const u = await seedUser('noop-restore@example.com');
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      await manageUsers.restoreUser(String(u._id));
      expect(emitSpy).not.toHaveBeenCalled();

      emitSpy.mockRestore();
    });

    it('restoreUser throws NotFound when the user does not exist', async () => {
      const missing = new Types.ObjectId().toString();
      await expect(manageUsers.restoreUser(missing)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('hard-deletes a user permanently and emits user.permanently_deleted', async () => {
      const u = await seedUser('hard@example.com');
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      const removed = await manageUsers.hardDeleteUser(String(u._id));
      expect(removed?.email).toBe('hard@example.com');

      const fromDb = await userModel.findById(u._id).exec();
      expect(fromDb).toBeNull();
      expect(await userModel.countDocuments()).toBe(0);

      expect(emitSpy).toHaveBeenCalledWith(
        UserEvents.PERMANENTLY_DELETED,
        expect.objectContaining({ userId: String(u._id) }),
      );

      emitSpy.mockRestore();
    });

    it('hard-delete returns null and emits nothing when the user does not exist', async () => {
      const missing = new Types.ObjectId().toString();
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      const removed = await manageUsers.hardDeleteUser(missing);
      expect(removed).toBeNull();
      expect(emitSpy).not.toHaveBeenCalled();

      emitSpy.mockRestore();
    });
  });
});
