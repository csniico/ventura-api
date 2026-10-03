import { PATH_METADATA } from '@nestjs/common/constants'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/**
 * The complete set of routes reachable WITHOUT an access token.
 *
 * Authentication is fail-closed: a global `JwtAuthGuard` covers every route
 * and `@Public()` is the only way out. This list is the review gate on that
 * decorator — adding a public route has to be a deliberate edit here, with a
 * reason, rather than something that slips in unnoticed (which is how
 * `/files` ended up open to the internet; see SEC-001).
 *
 * Before adding an entry, be sure the handler cannot read or mutate anything
 * belonging to an identifiable account on an unauthenticated caller's say-so.
 */
const EXPECTED_PUBLIC_ROUTES = [
  // Liveness probe.
  'AppController.getHello',
  // Pre-auth sign-in flows: by definition there is no token yet. Each one
  // verifies its own credential (password, emailed code, Google/Apple token).
  'AuthController.signInWithPassword',
  'AuthController.signInWithEmail',
  'AuthController.verifyCode',
  'AuthController.signInWithGoogle',
  'AuthController.signInWithApple',
  // Apple form-POSTs this return URL directly; it only bounces a redirect.
  'AuthController.appleCallback',
  // Carries a refresh token instead, validated by RefreshJwtGuard.
  'AuthController.refresh',
  // The sign-in UI asks whether to prompt for a password before the user is
  // authenticated. Returns a bare boolean, no profile data, and is throttled.
  'UserControllerV2.hasPassword',
].sort()

/** Every *.controller.ts under src. */
function controllerFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      controllerFiles(full, found)
    } else if (entry.endsWith('.controller.ts')) {
      found.push(full)
    }
  }
  return found
}

type ControllerClass = new (...args: never[]) => object

/** Exported classes carrying @Controller() metadata. */
function controllerClassesIn(file: string): ControllerClass[] {
  // The controllers are discovered at runtime on purpose: a static import list
  // would miss exactly the new controller this test exists to catch.
  // biome-ignore lint/style/noCommonJs: dynamic load is the point of this test
  const mod = require(file) as Record<string, unknown>
  return Object.values(mod).filter(
    (value): value is ControllerClass =>
      typeof value === 'function' &&
      Reflect.hasMetadata(PATH_METADATA, value as object),
  )
}

describe('public route surface', () => {
  const srcRoot = join(__dirname, '..', '..')

  const publicRoutes: string[] = []
  const controllerNames: string[] = []

  for (const file of controllerFiles(srcRoot)) {
    for (const controller of controllerClassesIn(file)) {
      controllerNames.push(controller.name)

      const isControllerPublic = Reflect.getMetadata(
        IS_PUBLIC_KEY,
        controller,
      ) as boolean | undefined

      const proto = controller.prototype as object
      for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor') continue

        const handler = (proto as Record<string, unknown>)[method]
        if (typeof handler !== 'function') continue
        // Only actual routes carry @Get/@Post/... path metadata.
        if (!Reflect.hasMetadata(PATH_METADATA, handler)) continue

        const isHandlerPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) as
          | boolean
          | undefined

        if (isControllerPublic || isHandlerPublic) {
          publicRoutes.push(`${controller.name}.${method}`)
        }
      }
    }
  }

  it('found the controllers to audit', () => {
    // Guards the test itself: a broken scan would silently pass everything.
    expect(controllerNames.length).toBeGreaterThanOrEqual(10)
    expect(controllerNames).toContain('FileStorageController')
    expect(controllerNames).toContain('UserControllerV2')
  })

  it('exposes exactly the reviewed set of unauthenticated routes', () => {
    const actual = publicRoutes.sort()

    const added = actual.filter((r) => !EXPECTED_PUBLIC_ROUTES.includes(r))
    expect(added).toEqual([])

    const removed = EXPECTED_PUBLIC_ROUTES.filter((r) => !actual.includes(r))
    expect(removed).toEqual([])
  })

  it.each([
    'FileStorageController',
    'BusinessController',
    'CustomerController',
    'InvoiceController',
    'OrderController',
    'ResourceController',
  ])('%s has no public route at all', (name) => {
    expect(publicRoutes.filter((r) => r.startsWith(`${name}.`))).toEqual([])
  })
})
