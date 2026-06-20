import { Test, TestingModule } from '@nestjs/testing';
import {
  MongooseModule,
  getModelToken,
  getConnectionToken,
} from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Connection, Model, Types } from 'mongoose';

import { BusinessService } from './business.service';
import {
  Business,
  BusinessDocument,
  BusinessSchema,
} from './schemas/business.schema';
import { UserService } from '../user/user.service';
import { User, UserDocument, UserSchema } from '../user/schemas/user.schema';
import {
  EmailChange,
  EmailChangeSchema,
} from '../user/schemas/email-change.schema';
import { MailService } from '../mail/mail.service';
import { resolveTestUri } from '../test-utils/test-db';
import { mockFileStorageProvider } from '../test-utils/file-storage.mock';

describe('BusinessService (integration)', () => {
  let moduleRef: TestingModule;
  let business: BusinessService;
  let users: UserService;
  let businessModel: Model<BusinessDocument>;
  let userModel: Model<UserDocument>;
  let connection: Connection;

  beforeAll(async () => {
    const uri = resolveTestUri('business');

    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Business.name, schema: BusinessSchema },
          { name: User.name, schema: UserSchema },
          { name: EmailChange.name, schema: EmailChangeSchema },
        ]),
      ],
      providers: [
        BusinessService,
        UserService,
        mockFileStorageProvider,
        { provide: MailService, useValue: { sendVerificationCode: jest.fn() } },
      ],
    }).compile();

    business = moduleRef.get(BusinessService);
    users = moduleRef.get(UserService);
    businessModel = moduleRef.get<Model<BusinessDocument>>(
      getModelToken(Business.name),
    );
    userModel = moduleRef.get<Model<UserDocument>>(getModelToken(User.name));
    connection = moduleRef.get<Connection>(getConnectionToken());
  });

  beforeEach(async () => {
    await businessModel.deleteMany({});
    await userModel.deleteMany({});
  });

  afterAll(async () => {
    await businessModel.deleteMany({});
    await userModel.deleteMany({});
    await connection.close();
    await moduleRef.close();
  });

  async function makeOwner(email = 'owner@example.com'): Promise<string> {
    const user = await users.createWithEmail({ firstName: 'Owner', email });
    return String(user._id);
  }

  it('exposes suggested categories', () => {
    const cats = business.getCategories();
    expect(cats).toContain('tech');
    expect(cats).toContain('beauty');
  });

  describe('create', () => {
    it('creates with only a name and links the owner', async () => {
      const ownerId = await makeOwner();
      const created = await business.create(ownerId, { name: 'Acme' });

      expect(created.name).toBe('Acme');
      expect(created.ownerId).toBe(ownerId);
      expect(created.shortId).toHaveLength(8);
      expect(created.categories).toEqual([]);

      // Owner's user doc was linked.
      const owner = await userModel.findById(ownerId).exec();
      expect(owner!.businessId).toBe(String(created._id));
    });

    it('stores name and custom categories on create', async () => {
      const ownerId = await makeOwner();
      const created = await business.create(ownerId, {
        name: 'Beauty Co',
        categories: ['beauty', 'custom-niche'],
      });

      expect(created.name).toBe('Beauty Co');
      expect(created.categories).toEqual(['beauty', 'custom-niche']);
      // Other properties are unset on create — they are added later via update.
      expect(created.description == null).toBe(true);
    });

    it('rejects a second business for the same owner and leaves no orphan', async () => {
      const ownerId = await makeOwner();
      await business.create(ownerId, { name: 'First' });

      await expect(
        business.create(ownerId, { name: 'Second' }),
      ).rejects.toBeInstanceOf(ConflictException);

      // Only the first business exists (the orphan was rolled back).
      const count = await businessModel.countDocuments();
      expect(count).toBe(1);
    });
  });

  describe('getById / getByOwner', () => {
    it('gets a business by id', async () => {
      const ownerId = await makeOwner();
      const created = await business.create(ownerId, { name: 'Acme' });

      const found = await business.getById(String(created._id));
      expect(found.name).toBe('Acme');
    });

    it('throws NotFound for a missing id', async () => {
      const missing = new Types.ObjectId().toString();
      await expect(business.getById(missing)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('gets the business by owner, or null when none', async () => {
      const ownerId = await makeOwner();
      expect(await business.getByOwner(ownerId)).toBeNull();

      await business.create(ownerId, { name: 'Acme' });
      const found = await business.getByOwner(ownerId);
      expect(found!.name).toBe('Acme');
    });
  });

  describe('update', () => {
    it('updates fields for the owner', async () => {
      const ownerId = await makeOwner();
      const created = await business.create(ownerId, { name: 'Acme' });

      const updated = await business.update(String(created._id), ownerId, {
        name: 'Acme Inc',
        tagLine: 'We build things',
      });

      expect(updated.name).toBe('Acme Inc');
      expect(updated.tagLine).toBe('We build things');
    });

    it('updates properties individually, leaving others untouched', async () => {
      const ownerId = await makeOwner();
      const created = await business.create(ownerId, {
        name: 'Acme',
        categories: ['tech'],
      });
      const id = String(created._id);

      // Each call sends only the one field the user changed.
      await business.update(id, ownerId, { description: 'We build things' });
      await business.update(id, ownerId, { phone: '+233200000000' });
      await business.update(id, ownerId, {
        businessHours: { monday: { open: '09:00', close: '17:00' } },
      });

      const fromDb = await businessModel.findById(id).exec();
      expect(fromDb?.description).toBe('We build things');
      expect(fromDb?.phone).toBe('+233200000000');
      expect(fromDb?.businessHours?.monday.open).toBe('09:00');
      // Untouched fields kept their original values.
      expect(fromDb?.name).toBe('Acme');
      expect(fromDb?.categories).toEqual(['tech']);
    });

    it('forbids updating a business the caller does not own', async () => {
      const ownerId = await makeOwner('a@example.com');
      const otherId = await makeOwner('b@example.com');
      const created = await business.create(ownerId, { name: 'Acme' });

      await expect(
        business.update(String(created._id), otherId, { name: 'Hijacked' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound updating a missing business', async () => {
      const ownerId = await makeOwner();
      const missing = new Types.ObjectId().toString();
      await expect(
        business.update(missing, ownerId, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
