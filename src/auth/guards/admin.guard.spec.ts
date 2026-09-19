import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserServiceV2 } from '../../user/application/user.service'
import { AdminGuard } from './admin.guard'

type StubUser = { email: string; isSystem: boolean; deleted: boolean }

function ctx(user?: { userId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext
}

function makeGuard(opts: {
  user?: StubUser
  adminEmails?: string
}): AdminGuard {
  const userService = {
    getUserById: jest.fn().mockResolvedValue(opts.user),
  } as unknown as UserServiceV2
  const config = {
    get: jest.fn().mockReturnValue(opts.adminEmails ?? ''),
  } as unknown as ConfigService
  return new AdminGuard(userService, config)
}

describe('AdminGuard', () => {
  it('allows a system user', async () => {
    const guard = makeGuard({
      user: { email: 'a@x.com', isSystem: true, deleted: false },
    })
    await expect(guard.canActivate(ctx({ userId: 'u1' }))).resolves.toBe(true)
  })

  it('allows an allow-listed email (case-insensitive)', async () => {
    const guard = makeGuard({
      user: { email: 'Admin@X.com', isSystem: false, deleted: false },
      adminEmails: 'admin@x.com, other@x.com',
    })
    await expect(guard.canActivate(ctx({ userId: 'u1' }))).resolves.toBe(true)
  })

  it('rejects a non-admin user', async () => {
    const guard = makeGuard({
      user: { email: 'joe@x.com', isSystem: false, deleted: false },
      adminEmails: 'admin@x.com',
    })
    await expect(
      guard.canActivate(ctx({ userId: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects a deleted admin', async () => {
    const guard = makeGuard({
      user: { email: 'admin@x.com', isSystem: true, deleted: true },
      adminEmails: 'admin@x.com',
    })
    await expect(
      guard.canActivate(ctx({ userId: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects when there is no authenticated user', async () => {
    const guard = makeGuard({ user: undefined })
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })
})
