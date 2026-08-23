import { Injectable, Logger, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'

/**
 * Logs every incoming request once its response finishes, including method,
 * path, status code, response size, duration, and client IP — the NestJS-
 * recommended middleware approach (uses the built-in Logger).
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req
    const userAgent = req.get('user-agent') ?? ''
    const start = Date.now()

    res.on('finish', () => {
      const { statusCode } = res
      const contentLength = res.get('content-length') ?? '0'
      const ms = Date.now() - start
      const message = `${method} ${originalUrl} ${statusCode} ${contentLength}b - ${ms}ms - ${req.ip} ${userAgent}`

      // 5xx -> error, 4xx -> warn, else -> log.
      if (statusCode >= 500) {
        this.logger.error(message)
      } else if (statusCode >= 400) {
        this.logger.warn(message)
      } else {
        this.logger.log(message)
      }
    })

    next()
  }
}
