import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import * as dotenv from 'dotenv'
import { fakeMailRepositoryProvider } from '../test-utils/fake-mail'
import { MailStatus } from './domain/mail.entity'
import { MailService } from './mail.service'

dotenv.config()

/**
 * LIVE mail spec — actually sends emails via Resend to MAIL_TEST_RECIPIENT.
 * Only the send path is real; the persistence uses an in-memory fake repo.
 *
 * Requires an explicit opt-in so it never runs in CI or the default
 * `pnpm jest` (even with MAIL_TEST_RECIPIENT sitting in .env). Both must be set:
 *
 *   MAIL_LIVE_TEST=true MAIL_TEST_RECIPIENT=you@example.com pnpm jest mail.service.live.spec
 *
 * Note: Resend only delivers from a verified domain. If RESEND_FROM_EMAIL's
 * domain isn't verified on the account, Resend restricts sends to the account
 * owner's own email — set MAIL_TEST_RECIPIENT to that address.
 */
const recipient = process.env.MAIL_TEST_RECIPIENT
const liveEnabled = process.env.MAIL_LIVE_TEST === 'true' && !!recipient
const describeLive = liveEnabled ? describe : describe.skip

describeLive('MailService (LIVE — really sends via Resend)', () => {
  let moduleRef: TestingModule
  let service: MailService

  beforeAll(async () => {
    const fakeMail = fakeMailRepositoryProvider()

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [MailService, fakeMail.provider],
    }).compile()

    service = moduleRef.get<MailService>(MailService)
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  // Generous timeout — these make real network calls.
  jest.setTimeout(30000)

  it('sends a real verification code email', async () => {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const mail = await service.sendVerificationCode(recipient!, code)
    expect(mail.status).toBe(MailStatus.SENT)
    expect(mail.providerId).toBeTruthy()
    console.log(`Sent verification code ${code} -> ${recipient}`)
  })

  it('sends a real welcome email', async () => {
    const mail = await service.sendWelcome(recipient!, 'Christian')
    expect(mail.status).toBe(MailStatus.SENT)
    expect(mail.providerId).toBeTruthy()
  })

  it('sends a real existing-user sign-in notice', async () => {
    const mail = await service.sendExistingUserSignin(recipient!, 'Christian')
    expect(mail.status).toBe(MailStatus.SENT)
    expect(mail.providerId).toBeTruthy()
  })

  it('sends a real password-change-requested notice', async () => {
    const mail = await service.sendPasswordChangeRequested(
      recipient!,
      'Christian',
    )
    expect(mail.status).toBe(MailStatus.SENT)
    expect(mail.providerId).toBeTruthy()
  })

  it('sends a real password-changed notice', async () => {
    const mail = await service.sendPasswordChanged(recipient!, 'Christian')
    expect(mail.status).toBe(MailStatus.SENT)
    expect(mail.providerId).toBeTruthy()
  })

  it('sends a real account-deleted (soft delete) notice', async () => {
    const mail = await service.sendAccountDeleted(recipient!, 'Christian')
    expect(mail.status).toBe(MailStatus.SENT)
    expect(mail.providerId).toBeTruthy()
  })
})
