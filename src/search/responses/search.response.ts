import { ApiProperty } from '@nestjs/swagger';
import { CustomerResponse } from '../../customer/responses/customer.response';
import { ResourceResponse } from '../../resource/responses/resource.response';
import { OrderResponse } from '../../order/responses/order.response';
import { InvoiceResponse } from '../../invoice/responses/invoice.response';
import { AppointmentResponse } from '../../appointment/responses/appointment.response';

/** Grouped cross-entity search results for the global search bar. */
export class SearchResultsResponse {
  @ApiProperty({ example: 'acme' })
  query!: string;

  @ApiProperty({ type: CustomerResponse, isArray: true })
  customers!: CustomerResponse[];

  @ApiProperty({ type: ResourceResponse, isArray: true })
  resources!: ResourceResponse[];

  @ApiProperty({ type: OrderResponse, isArray: true })
  orders!: OrderResponse[];

  @ApiProperty({ type: InvoiceResponse, isArray: true })
  invoices!: InvoiceResponse[];

  @ApiProperty({ type: AppointmentResponse, isArray: true })
  appointments!: AppointmentResponse[];
}
