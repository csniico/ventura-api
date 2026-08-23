import { ApiProperty } from '@nestjs/swagger'

/** Revenue totals + trend for the dashboard. */
export class DashboardRevenueResponse {
  @ApiProperty({ example: 1250.5 })
  total!: number

  @ApiProperty({ example: 450.0 })
  last30Days!: number

  @ApiProperty({ example: 300.0 })
  previous30Days!: number

  @ApiProperty({ required: false, nullable: true, example: 50 })
  trendPercent!: number | null
}

/** A top-selling product entry. */
export class DashboardTopProductResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  resourceId!: string

  @ApiProperty({ example: 'Bag of cement' })
  name!: string

  @ApiProperty({ example: 42 })
  unitsSold!: number
}

/** Inventory snapshot for the dashboard. */
export class DashboardInventoryResponse {
  @ApiProperty({ example: 3 })
  lowStockCount!: number

  @ApiProperty({ type: [DashboardTopProductResponse] })
  topProducts!: DashboardTopProductResponse[]
}

/** A recent invoice summary row. */
export class DashboardRecentInvoiceResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  invoiceId!: string

  @ApiProperty({ example: 'VEN-260617120000123-AB12CD' })
  invoiceNumber!: string

  @ApiProperty({ required: false, nullable: true, example: 'Ada Lovelace' })
  customerName!: string | null

  @ApiProperty({ example: 120.0 })
  totalAmount!: number

  @ApiProperty({ example: 'PAID' })
  status!: string

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date
}

/** A single day's revenue point. */
export class DashboardDailyRevenueResponse {
  @ApiProperty({ example: '2026-06-17' })
  date!: string

  @ApiProperty({ example: 99.99 })
  amount!: number
}

/** Aggregated dashboard summary for the home screen. */
export class DashboardSummaryResponse {
  @ApiProperty({ type: DashboardRevenueResponse })
  revenue!: DashboardRevenueResponse

  @ApiProperty({ type: DashboardInventoryResponse })
  inventory!: DashboardInventoryResponse

  @ApiProperty({ type: [DashboardRecentInvoiceResponse] })
  recentInvoices!: DashboardRecentInvoiceResponse[]

  @ApiProperty({ type: [DashboardDailyRevenueResponse] })
  dailyRevenue!: DashboardDailyRevenueResponse[]
}
