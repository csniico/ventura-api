import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { AllExceptionsFilter } from './all-exceptions.filter'

function makeHost(): {
  host: ArgumentsHost
  status: jest.Mock
  json: jest.Mock
} {
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/users/not-a-uuid' }),
    }),
  } as unknown as ArgumentsHost
  return { host, status, json }
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter()

  beforeAll(() => {
    // The unhandled-error branch logs a stack; keep the test output clean.
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined)
  })

  it('passes an HttpException through with its own status and body', () => {
    const { host, status, json } = makeHost()

    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['name must exist'],
      }),
      host,
    )

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['name must exist'],
    })
  })

  it("keeps a built-in exception's own envelope", () => {
    const { host, status, json } = makeHost()

    filter.catch(new ForbiddenException('You do not own this file.'), host)

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: 'You do not own this file.',
      }),
    )
  })

  it('wraps a bare-string HttpException body in the standard envelope', () => {
    const { host, status, json } = makeHost()

    // `new HttpException('msg', status)` yields a string body, unlike the
    // built-in subclasses which build an object.
    filter.catch(new HttpException('Teapot.', HttpStatus.I_AM_A_TEAPOT), host)

    expect(status).toHaveBeenCalledWith(HttpStatus.I_AM_A_TEAPOT)
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.I_AM_A_TEAPOT,
      message: 'Teapot.',
    })
  })

  it('turns a malformed-uuid driver error into a 400, not a 500', () => {
    const { host, status, json } = makeHost()
    const driverError = Object.assign(
      new Error('invalid input syntax for type uuid: "not-a-uuid"'),
      { code: '22P02' },
    )

    filter.catch(driverError, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    )
  })

  it('finds the driver code through a MikroORM wrapper', () => {
    const { host, status } = makeHost()
    const wrapped = Object.assign(new Error('driver exception'), {
      previous: Object.assign(new Error('invalid input syntax'), {
        code: '22P02',
      }),
    })

    filter.catch(wrapped, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
  })

  it('returns a generic 500 for an unknown error, leaking no internals', () => {
    const { host, status, json } = makeHost()

    filter.catch(new Error('connect ECONNREFUSED 10.0.0.4:5432'), host)

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    })
    // The real cause must not reach the client.
    expect(JSON.stringify(json.mock.calls)).not.toContain('ECONNREFUSED')
  })
})
