import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CustomerService } from '../../customer/application/customer.service'
import {
  AppointmentStatus,
  IAppointment,
  Invitee,
  Recurrence,
} from '../domain/appointment.entity'
import type {
  AppointmentRepository,
  IUpdateAppointment,
} from '../domain/appointment.repository'
import { APPOINTMENT_DATA_SOURCE } from '../domain/appointment.repository'
import {
  CreateAppointmentDto,
  InviteeDto,
  RecurrenceDto,
} from '../dto/create-appointment.dto'
import { UpdateAppointmentDto } from '../dto/update-appointment.dto'

/**
 * Postgres-backed appointment service. Data access goes through the
 * `AppointmentRepository` abstraction (DIP); business rules (time-range and
 * invitee validation, recurrence mapping) live here. Every operation is scoped
 * to a `businessId`. Methods return the domain `IAppointment`; mapping to
 * `AppointmentResponse` happens at the controller boundary.
 */
@Injectable()
export class AppointmentService {
  constructor(
    @Inject(APPOINTMENT_DATA_SOURCE)
    private readonly appointmentRepository: AppointmentRepository,
    private readonly customerService: CustomerService,
  ) {}

  /** Validate that end is strictly after start. */
  private assertValidRange(start: Date, end: Date): void {
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('end must be after start.')
    }
  }

  /**
   * Validate that every invitee referencing a customer points to a real customer
   * in this business. getById throws NotFound, surfaced as a BadRequest naming
   * the offending invitee.
   */
  private async validateInvitees(
    businessId: string,
    invitees: InviteeDto[] = [],
  ): Promise<void> {
    await Promise.all(
      invitees.map(async (invitee) => {
        if (!invitee.customerId) return
        try {
          await this.customerService.getById(businessId, invitee.customerId)
        } catch {
          throw new BadRequestException(
            `Invitee "${invitee.name}" references a customer that does not exist in this business.`,
          )
        }
      }),
    )
  }

  private toInvitees(invitees: InviteeDto[] = []): Invitee[] {
    return invitees.map((i) => ({
      name: i.name,
      email: i.email ?? null,
      customerId: i.customerId ?? null,
    }))
  }

  private toRecurrence(recurrence: RecurrenceDto): Recurrence {
    return {
      frequency: recurrence.frequency,
      interval: recurrence.interval ?? 1,
      until: recurrence.until ? new Date(recurrence.until) : null,
    }
  }

  /** Create an appointment for a business. */
  async create(
    businessId: string,
    createdBy: string,
    dto: CreateAppointmentDto,
  ): Promise<IAppointment> {
    const start = new Date(dto.start)
    const end = new Date(dto.end)
    this.assertValidRange(start, end)
    await this.validateInvitees(businessId, dto.invitees)

    return this.appointmentRepository.create({
      businessId,
      createdBy,
      title: dto.title,
      start,
      end,
      notes: dto.notes ?? null,
      location: dto.location ?? null,
      invitees: this.toInvitees(dto.invitees),
      recurrence: dto.recurrence ? this.toRecurrence(dto.recurrence) : null,
    })
  }

  /**
   * List a business's appointments, soonest first. Optionally filter to those
   * starting within [from, to] (inclusive of the day).
   */
  async list(
    businessId: string,
    from?: string,
    to?: string,
  ): Promise<IAppointment[]> {
    return await this.appointmentRepository.list(
      businessId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    )
  }

  /**
   * Free-text search over a business's appointments by title, soonest first.
   * Used by the global search bar. Empty query returns nothing.
   */
  async search(
    businessId: string,
    q: string,
    limit = 5,
  ): Promise<IAppointment[]> {
    const query = q.trim()
    if (!query) return []
    return await this.appointmentRepository.search(businessId, query, limit)
  }

  /** Get an appointment by id, scoped to the business. */
  async getById(
    businessId: string,
    appointmentId: string,
  ): Promise<IAppointment> {
    const appointment = await this.appointmentRepository.findById(
      businessId,
      appointmentId,
    )
    if (!appointment) {
      throw new NotFoundException('Appointment not found.')
    }
    return appointment
  }

  /** Set an appointment's status (scheduled / completed / attended / cancelled). */
  async updateStatus(
    businessId: string,
    appointmentId: string,
    status: AppointmentStatus,
  ): Promise<IAppointment> {
    await this.getById(businessId, appointmentId)
    const updated = await this.appointmentRepository.update(
      businessId,
      appointmentId,
      { status },
    )
    if (!updated) {
      throw new NotFoundException('Appointment not found.')
    }
    return updated
  }

  /** Update an appointment, scoped to the business. */
  async update(
    businessId: string,
    appointmentId: string,
    dto: UpdateAppointmentDto,
  ): Promise<IAppointment> {
    const appointment = await this.getById(businessId, appointmentId)

    const patch: IUpdateAppointment = {}
    if (dto.title !== undefined) patch.title = dto.title
    if (dto.notes !== undefined) patch.notes = dto.notes
    if (dto.location !== undefined) patch.location = dto.location

    const start = dto.start ? new Date(dto.start) : appointment.start
    const end = dto.end ? new Date(dto.end) : appointment.end
    if (dto.start !== undefined || dto.end !== undefined) {
      this.assertValidRange(start, end)
      patch.start = start
      patch.end = end
    }

    if (dto.invitees !== undefined) {
      await this.validateInvitees(businessId, dto.invitees)
      patch.invitees = this.toInvitees(dto.invitees)
    }

    if (dto.clearRecurrence) {
      patch.recurrence = null
    } else if (dto.recurrence !== undefined) {
      patch.recurrence = this.toRecurrence(dto.recurrence)
    }

    const updated = await this.appointmentRepository.update(
      businessId,
      appointmentId,
      patch,
    )
    return updated ?? appointment
  }

  /** Delete an appointment, scoped to the business. */
  async delete(
    businessId: string,
    appointmentId: string,
  ): Promise<IAppointment> {
    const removed = await this.appointmentRepository.delete(
      businessId,
      appointmentId,
    )
    if (!removed) {
      throw new NotFoundException('Appointment not found.')
    }
    return removed
  }
}
