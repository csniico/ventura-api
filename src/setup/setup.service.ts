import { Injectable } from '@nestjs/common'
import { AppointmentService } from '../appointment/application/appointment.service'
import { CustomerService } from '../customer/application/customer.service'
import { InvoiceService } from '../invoice/application/invoice.service'
import { OrderService } from '../order/application/order.service'
import { ResourceService } from '../resource/application/resource.service'
import { UserServiceV2 } from '../user/application/user.service'
import { SetupStatusResponse } from './responses/setup-status.response'

/**
 * Reports first-run setup progress for the guided "getting started" flow.
 * Resolves the caller's business from their user, then checks each entity for
 * existence. All entities are now Postgres-backed (queried through their owning
 * services). Works before a business exists (all false), so the client can call
 * it without tripping the business-required 403 on the lists.
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly userService: UserServiceV2,
    private readonly customerService: CustomerService,
    private readonly resourceService: ResourceService,
    private readonly orderService: OrderService,
    private readonly invoiceService: InvoiceService,
    private readonly appointmentService: AppointmentService,
  ) {}

  async getStatus(userId: string): Promise<SetupStatusResponse> {
    const user = await this.userService.getUserById(userId)
    const businessId = user.businessId

    if (!businessId) {
      return {
        hasBusiness: false,
        hasCustomers: false,
        hasResources: false,
        hasOrders: false,
        hasInvoices: false,
        hasAppointments: false,
        complete: false,
      }
    }

    const customerExists = async () =>
      (await this.customerService.list(businessId, { limit: 1 })).meta.total > 0
    const resourceExists = async () =>
      (await this.resourceService.list(businessId, { limit: 1 })).meta.total > 0
    const orderExists = async () =>
      (await this.orderService.list(businessId, { limit: 1 })).meta.total > 0
    const invoiceExists = async () =>
      (await this.invoiceService.list(businessId, { limit: 1 })).meta.total > 0
    const appointmentExists = async () =>
      (await this.appointmentService.list(businessId)).length > 0

    const [
      hasCustomers,
      hasResources,
      hasOrders,
      hasInvoices,
      hasAppointments,
    ] = await Promise.all([
      customerExists(),
      resourceExists(),
      orderExists(),
      invoiceExists(),
      appointmentExists(),
    ])

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
    }
  }
}
