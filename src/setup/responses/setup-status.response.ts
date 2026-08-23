import { ApiProperty } from '@nestjs/swagger'

/**
 * Whether the signed-in user has completed each first-run setup step. Drives
 * the guided "getting started" flow. Computed from the user's business + data,
 * and safe to call before a business exists (everything is then false).
 */
export class SetupStatusResponse {
  @ApiProperty({ example: false })
  hasBusiness!: boolean

  @ApiProperty({ example: false })
  hasCustomers!: boolean

  @ApiProperty({ example: false })
  hasResources!: boolean

  @ApiProperty({ example: false })
  hasOrders!: boolean

  @ApiProperty({ example: false })
  hasInvoices!: boolean

  @ApiProperty({ example: false })
  hasAppointments!: boolean

  /** True once every step above is done. */
  @ApiProperty({ example: false })
  complete!: boolean
}
