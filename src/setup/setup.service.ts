import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserService } from '../user/user.service';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { Resource, ResourceDocument } from '../resource/schemas/resource.schema';
import { Order, OrderDocument } from '../order/schemas/order.schema';
import { Invoice, InvoiceDocument } from '../invoice/schemas/invoice.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../appointment/schemas/appointment.schema';
import { SetupStatusResponse } from './responses/setup-status.response';

/**
 * Reports first-run setup progress for the guided "getting started" flow.
 * Resolves the caller's business from their user doc and checks for the
 * existence of each entity. Works before a business exists (all false), so the
 * client can call it without tripping the business-required 403 on the lists.
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly userService: UserService,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Resource.name)
    private readonly resourceModel: Model<ResourceDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
  ) {}

  async getStatus(userId: string): Promise<SetupStatusResponse> {
    const user = await this.userService.getUserById(userId);
    const businessId = user.businessId;

    if (!businessId) {
      return {
        hasBusiness: false,
        hasCustomers: false,
        hasResources: false,
        hasOrders: false,
        hasInvoices: false,
        hasAppointments: false,
        complete: false,
      };
    }

    const exists = async (model: Model<{ businessId?: string }>) =>
      !!(await model.exists({ businessId }));

    const [hasCustomers, hasResources, hasOrders, hasInvoices, hasAppointments] =
      await Promise.all([
        exists(this.customerModel),
        exists(this.resourceModel),
        exists(this.orderModel),
        exists(this.invoiceModel),
        exists(this.appointmentModel),
      ]);

    return {
      hasBusiness: true,
      hasCustomers,
      hasResources,
      hasOrders,
      hasInvoices,
      hasAppointments,
      complete:
        hasCustomers &&
        hasResources &&
        hasOrders &&
        hasInvoices &&
        hasAppointments,
    };
  }
}
