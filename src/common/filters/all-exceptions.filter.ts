import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Request, Response } from 'express'

/** Postgres: invalid text representation (e.g. a malformed uuid literal). */
const PG_INVALID_TEXT_REPRESENTATION = '22P02'

/**
 * Postgres driver errors carry a string `code`, which the typings do not
 * describe. MikroORM wraps the original in a `DriverException`, so follow the
 * `previous` / `cause` chain rather than only looking at the top-level error.
 */
function driverCodeOf(error: unknown, depth = 0): string | undefined {
  if (typeof error !== 'object' || error === null || depth > 4) return undefined

  const candidate = error as {
    code?: unknown
    previous?: unknown
    cause?: unknown
  }
  if (typeof candidate.code === 'string') return candidate.code

  return (
    driverCodeOf(candidate.previous, depth + 1) ??
    driverCodeOf(candidate.cause, depth + 1)
  )
}

/**
 * Last line of defence for anything that reaches the HTTP layer unhandled.
 *
 * Two jobs:
 *  - Map driver errors that are really bad *input* to a 4xx. A malformed uuid
 *    in a path param reached Postgres and surfaced as a 500, which reads as a
 *    server fault and leaks the driver's message (SEC-013).
 *  - Make sure an unrecognised error never returns internals to the caller.
 *    The full error is logged server-side instead.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    // Everything Nest already models (ForbiddenException, validation errors,
    // …) keeps its own status and body. getResponse() is an object for the
    // rich cases and a bare string for `new ForbiddenException('msg')`; the
    // string is wrapped so clients always get the same envelope back, exactly
    // as Nest's own default filter does.
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        )
      return
    }

    if (driverCodeOf(exception) === PG_INVALID_TEXT_REPRESENTATION) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Malformed identifier or value in the request.',
        error: 'Bad Request',
      })
      return
    }

    this.logger.error(
      `Unhandled error on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    )

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    })
  }
}
