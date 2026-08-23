import type { EventEmitter2 } from '@nestjs/event-emitter'

/** Event names emitted for user account lifecycle changes. */
export const UserEvents = {
  DELETED: 'user.deleted',
  RESTORED: 'user.restored',
  // Permanent (hard) deletion, performed by an admin.
  PERMANENTLY_DELETED: 'user.permanently_deleted',
} as const

export type UserEventName = (typeof UserEvents)[keyof typeof UserEvents]

/** Payload for user account lifecycle events. */
export interface UserAccountEvent {
  userId: string
  timestamp: Date
}

/**
 * Typed wrapper around EventEmitter2.emit for user account events. Keeps the
 * event name a plain string (which emit accepts) so call sites don't trip the
 * no-unsafe-argument rule on EventEmitter2's loose typings.
 */
export function emitUserEvent(
  emitter: EventEmitter2,
  event: UserEventName,
  payload: UserAccountEvent,
): void {
  emitter.emit(event, payload)
}
