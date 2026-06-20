import { PartialType } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto';

/**
 * Update a customer. All fields optional — the frontend sends only the
 * field(s) the user changed. Validators from [CreateCustomerDto] still apply
 * to any field that is present.
 */
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
