import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  MongooseModule,
  getModelToken,
  getConnectionToken,
} from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { MailService } from './mail.service';
import {
  Mail,
  MailDocument,
  MailSchema,
  MailStatus,
  MailType,
} from './schemas/mail.schema';
import { resolveTestUri } from '../test-utils/test-db';

describe('MailService (integration, real MongoDB, mocked Resend)', () => {
  let moduleRef: TestingModule;
  let service: MailService;
  let mailModel: Model<MailDocument>;
  let connection: Connection;

  // Mock the Resend client's send so no real emails go out.
  type SendArg = { to: string; from: string; subject: string; html: string };
  let sendMock: jest.Mock<
    Promise<{ data: { id: string } | null; error: { message: string } | null }>,
    [SendArg]
  >;

  beforeAll(async () => {
    const uri = resolveTestUri('mail');

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([{ name: Mail.name, schema: MailSchema }]),
      ],
      providers: [MailService],
    }).compile();

    service = moduleRef.get<MailService>(MailService);
    mailModel = moduleRef.get<Model<MailDocument>>(getModelToken(Mail.name));
    connection = moduleRef.get<Connection>(getConnectionToken());

    // Replace the internal Resend client's emails.send with a mock.
    sendMock = jest.fn<
      Promise<{
        data: { id: string } | null;
        error: { message: string } | null;
      }>,
      [SendArg]
    >();
    (service as unknown as { resend: { emails: { send: jest.Mock } } }).resend =
      { emails: { send: sendMock } };
  });

  beforeEach(async () => {
    await mailModel.deleteMany({});
    sendMock.mockReset();
  });

  afterAll(async () => {
    await mailModel.deleteMany({});
    await connection.close();
    await moduleRef.close();
  });

  it('sends a verification code and records it as sent', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 're_123' }, error: null });

    const mail = await service.sendVerificationCode(
      'user@example.com',
      '123456',
    );

    // Called Resend with the right shape.
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.to).toBe('user@example.com');
    expect(arg.html).toContain('123456');

    // Persisted record.
    expect(mail.status).toBe(MailStatus.SENT);
    expect(mail.type).toBe(MailType.VERIFICATION_CODE);
    expect(mail.providerId).toBe('re_123');

    const fromDb = await mailModel.findById(mail._id).exec();
    expect(fromDb?.to).toBe('user@example.com');
    expect(fromDb?.status).toBe(MailStatus.SENT);
  });

  it('records a failed send when Resend returns an error (without throwing)', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'domain not verified' },
    });

    const mail = await service.sendWelcome('new@example.com', 'Ada');

    expect(mail.status).toBe(MailStatus.FAILED);
    expect(mail.error).toBe('domain not verified');
    expect(mail.providerId).toBeNull();
  });

  it('records a failed send when Resend throws (without throwing)', async () => {
    sendMock.mockRejectedValueOnce(new Error('network down'));

    const mail = await service.sendPasswordChanged('p@example.com', 'Grace');

    expect(mail.status).toBe(MailStatus.FAILED);
    expect(mail.error).toBe('network down');
  });

  it('sends the welcome email with the user name', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 're_w' }, error: null });

    await service.sendWelcome('welcome@example.com', 'Ada');

    const arg = sendMock.mock.calls[0][0];
    expect(arg.subject).toContain('Welcome');
    expect(arg.html).toContain('Ada');
  });

  it('sends the existing-user sign-in notice', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 're_e' }, error: null });

    const mail = await service.sendExistingUserSignin('e@example.com', 'Linus');

    expect(mail.type).toBe(MailType.EXISTING_USER_SIGNIN);
    expect(mail.status).toBe(MailStatus.SENT);
  });

  it('sends the password-change-requested notice', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 're_pcr' }, error: null });

    const mail = await service.sendPasswordChangeRequested(
      'pcr@example.com',
      'Ada',
    );

    const arg = sendMock.mock.calls[0][0];
    expect(arg.subject).toContain('Password change requested');
    expect(arg.html).toContain('Ada');
    expect(mail.type).toBe(MailType.PASSWORD_CHANGE_REQUESTED);
    expect(mail.status).toBe(MailStatus.SENT);
  });

  it('sends the account-deleted (soft delete) notice with the grace period', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 're_del' }, error: null });

    const mail = await service.sendAccountDeleted('del@example.com', 'Ada');

    const arg = sendMock.mock.calls[0][0];
    expect(arg.subject).toContain('deactivated');
    expect(arg.html).toContain('90 days');
    expect(arg.html).toContain('sign in');
    expect(mail.type).toBe(MailType.ACCOUNT_DELETED);
    expect(mail.status).toBe(MailStatus.SENT);
  });
});
