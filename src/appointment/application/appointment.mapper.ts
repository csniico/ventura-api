import { IAppointment } from '../domain/appointment.entity'
import { AppointmentResponse } from '../responses/appointment.response'

/**
 * Project a domain `IAppointment` onto the public `AppointmentResponse`,
 * normalising nullable columns.
 */
export function toAppointmentResponse(
  appointment: IAppointment,
): AppointmentResponse {
  return {
    id: appointment.id,
    shortId: appointment.shortId,
    businessId: appointment.businessId,
    createdBy: appointment.createdBy,
    title: appointment.title,
    start: appointment.start,
    end: appointment.end,
    notes: appointment.notes ?? null,
    location: appointment.location ?? null,
    invitees: (appointment.invitees ?? []).map((i) => ({
      name: i.name,
      email: i.email ?? null,
      customerId: i.customerId ?? null,
    })),
    recurrence: appointment.recurrence
      ? {
          frequency: appointment.recurrence.frequency,
          interval: appointment.recurrence.interval,
          until: appointment.recurrence.until ?? null,
        }
      : null,
    status: appointment.status,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  }
}
