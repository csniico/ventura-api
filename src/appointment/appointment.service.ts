import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomerService } from '../customer/customer.service';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';
import { CreateAppointmentDto, InviteeDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentService {
  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    private readonly customerService: CustomerService,
  ) {}

  /** Validate that end is strictly after start. */
  private assertValidRange(start: Date, end: Date): void {
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('end must be after start.');
    }
  }

  /**
   * Validate that every invitee referencing a customer points to a real
   * customer in this business. getById throws NotFound, which we surface as a
   * BadRequest naming the offending invitee.
   */
  private async validateInvitees(
    businessId: string,
    invitees: InviteeDto[] = [],
  ): Promise<void> {
    await Promise.all(
      invitees.map(async (invitee) => {
        if (!invitee.customerId) return;
        try {
          await this.customerService.getById(businessId, invitee.customerId);
        } catch {
          throw new BadRequestException(
            `Invitee "${invitee.name}" references a customer that does not exist in this business.`,
          );
        }
      }),
    );
  }

  /** Create an appointment for a business. */
  async create(
    businessId: string,
    createdBy: string,
    dto: CreateAppointmentDto,
  ): Promise<AppointmentDocument> {
    const start = new Date(dto.start);
    const end = new Date(dto.end);
    this.assertValidRange(start, end);
    await this.validateInvitees(businessId, dto.invitees);

    return this.appointmentModel.create({
      businessId,
      createdBy,
      title: dto.title,
      start,
      end,
      notes: dto.notes,
      location: dto.location,
      invitees: dto.invitees ?? [],
      recurrence: dto.recurrence
        ? {
            frequency: dto.recurrence.frequency,
            interval: dto.recurrence.interval ?? 1,
            until: dto.recurrence.until ? new Date(dto.recurrence.until) : null,
          }
        : null,
    });
  }

  /**
   * List a business's appointments, soonest first. Optionally filter to those
   * starting within [from, to] (inclusive of the day).
   */
  async list(
    businessId: string,
    from?: string,
    to?: string,
  ): Promise<AppointmentDocument[]> {
    const query: Record<string, unknown> = { businessId };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.$gte = new Date(from);
      if (to) range.$lte = new Date(to);
      query.start = range;
    }
    return this.appointmentModel.find(query).sort({ start: 1 }).exec();
  }

  /**
   * Free-text search over a business's appointments by title, soonest first.
   * Used by the global search bar. Empty query returns nothing.
   */
  async search(
    businessId: string,
    q: string,
    limit = 5,
  ): Promise<AppointmentDocument[]> {
    const query = q.trim();
    if (!query) return [];
    // Escape regex metacharacters so user input is treated literally.
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.appointmentModel
      .find({ businessId, title: { $regex: escaped, $options: 'i' } })
      .sort({ start: 1 })
      .limit(limit)
      .exec();
  }

  /** Get an appointment by id, scoped to the business. */
  async getById(
    businessId: string,
    appointmentId: string,
  ): Promise<AppointmentDocument> {
    const appointment = await this.appointmentModel
      .findOne({ _id: appointmentId, businessId })
      .exec();
    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
    }
    return appointment;
  }

  /** Update an appointment, scoped to the business. */
  async update(
    businessId: string,
    appointmentId: string,
    dto: UpdateAppointmentDto,
  ): Promise<AppointmentDocument> {
    const appointment = await this.getById(businessId, appointmentId);

    if (dto.title !== undefined) appointment.title = dto.title;
    if (dto.notes !== undefined) appointment.notes = dto.notes;
    if (dto.location !== undefined) appointment.location = dto.location;

    const start = dto.start ? new Date(dto.start) : appointment.start;
    const end = dto.end ? new Date(dto.end) : appointment.end;
    if (dto.start !== undefined || dto.end !== undefined) {
      this.assertValidRange(start, end);
      appointment.start = start;
      appointment.end = end;
    }

    if (dto.invitees !== undefined) {
      await this.validateInvitees(businessId, dto.invitees);
      appointment.invitees = dto.invitees;
    }

    if (dto.clearRecurrence) {
      appointment.recurrence = null;
    } else if (dto.recurrence !== undefined) {
      appointment.recurrence = {
        frequency: dto.recurrence.frequency,
        interval: dto.recurrence.interval ?? 1,
        until: dto.recurrence.until ? new Date(dto.recurrence.until) : null,
      };
    }

    return appointment.save();
  }

  /** Delete an appointment, scoped to the business. */
  async delete(
    businessId: string,
    appointmentId: string,
  ): Promise<AppointmentDocument> {
    const appointment = await this.appointmentModel
      .findOneAndDelete({ _id: appointmentId, businessId })
      .exec();
    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
    }
    return appointment;
  }
}
