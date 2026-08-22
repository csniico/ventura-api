import { Injectable } from '@nestjs/common';
import { CustomerService } from '../customer/application/customer.service';
import { toCustomerResponse } from '../customer/application/customer.mapper';
import { ResourceService } from '../resource/application/resource.service';
import { toResourceResponse } from '../resource/application/resource.mapper';
import { OrderService } from '../order/application/order.service';
import { toOrderResponse } from '../order/application/order.mapper';
import { InvoiceService } from '../invoice/application/invoice.service';
import { toInvoiceResponse } from '../invoice/application/invoice.mapper';
import { AppointmentService } from '../appointment/application/appointment.service';
import { toAppointmentResponse } from '../appointment/application/appointment.mapper';

const PER_GROUP_LIMIT = 5;

export interface SearchResults {
  query: string;
  customers: unknown[];
  resources: unknown[];
  orders: unknown[];
  invoices: unknown[];
  appointments: unknown[];
}

/**
 * Cross-entity search for the single search bar. Runs each resource's own
 * scoped `q` search (business-scoped) in parallel and returns grouped, capped
 * results. Reuses the per-resource pagination/search built into each service.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly customerService: CustomerService,
    private readonly resourceService: ResourceService,
    private readonly orderService: OrderService,
    private readonly invoiceService: InvoiceService,
    private readonly appointmentService: AppointmentService,
  ) {}

  async search(businessId: string, q: string): Promise<SearchResults> {
    const query = q.trim();
    // Empty query -> empty groups, no DB work.
    if (!query) {
      return {
        query,
        customers: [],
        resources: [],
        orders: [],
        invoices: [],
        appointments: [],
      };
    }

    const opts = { q: query, page: 1, limit: PER_GROUP_LIMIT };
    const [customers, resources, orders, invoices, appointments] =
      await Promise.all([
        this.customerService.list(businessId, opts),
        this.resourceService.list(businessId, opts),
        this.orderService.list(businessId, opts),
        this.invoiceService.list(businessId, opts),
        this.appointmentService.search(businessId, query, PER_GROUP_LIMIT),
      ]);

    return {
      query,
      // Customers + resources + orders are Postgres-backed; map to shared shape.
      customers: customers.data.map(toCustomerResponse),
      resources: resources.data.map(toResourceResponse),
      orders: orders.data.map(toOrderResponse),
      invoices: invoices.data.map(toInvoiceResponse),
      appointments: appointments.map(toAppointmentResponse),
    };
  }
}
