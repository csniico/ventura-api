import { ICustomer } from '../domain/customer.entity'
import { CustomerResponse } from '../responses/customer.response'

/** Project a domain `ICustomer` onto the public `CustomerResponse` contract. */
export function toCustomerResponse(customer: ICustomer): CustomerResponse {
  return {
    id: customer.id,
    shortId: customer.shortId,
    businessId: customer.businessId,
    name: customer.name,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    notes: customer.notes ?? null,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  }
}
