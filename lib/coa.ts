// Chart of Accounts — templates and shared types.
//
// Each entity gets its OWN chart of accounts (client-scoped). The chart is
// seeded from an industry template at entity creation (or backfilled), and the
// P&L is built by aggregating transactions per account — not by free-text.

export type AccountType = 'income' | 'cogs' | 'expense' | 'asset' | 'liability' | 'equity'

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  income: 'Income',
  cogs: 'Cost of Goods Sold',
  expense: 'Operating Expenses',
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
}

// Display / P&L ordering of the account classes.
export const ACCOUNT_TYPE_ORDER: AccountType[] = ['income', 'cogs', 'expense', 'asset', 'liability', 'equity']

export type TemplateAccount = {
  code: string
  name: string
  type: AccountType
  tax_line?: string
}

export type ChartTemplate = {
  key: string
  label: string
  description: string
  accounts: TemplateAccount[]
}

// Plumbing accounts every entity needs for reconciliation, regardless of industry.
const COMMON_STRUCTURAL: TemplateAccount[] = [
  { code: '1010', name: 'Operating Bank', type: 'asset' },
  { code: '2010', name: 'Credit Card Payable', type: 'liability' },
  { code: '2020', name: 'Sales Tax Payable (CDTFA)', type: 'liability' },
  { code: '3010', name: "Owner's Draw / Distributions", type: 'equity' },
]

// ── Tire shop (retail + service), S-corp ─────────────────────────────────────
const TIRE_SHOP: TemplateAccount[] = [
  // Income — new vs used tires are SEPARATE accounts on purpose: the CDTFA
  // California tire fee ($1.75/unit, quarterly) is charged on NEW tires only, so
  // the new-tire unit count has to be isolatable (via the sales-journal qty).
  { code: '4010', name: 'New Tire Sales', type: 'income', tax_line: 'Gross receipts · CA tire fee ($1.75/unit)' },
  { code: '4015', name: 'Used Tire Sales', type: 'income', tax_line: 'Gross receipts' },
  { code: '4020', name: 'Wheel / Rim Sales', type: 'income', tax_line: 'Gross receipts' },
  { code: '4030', name: 'Service & Labor', type: 'income', tax_line: 'Gross receipts' },
  { code: '4040', name: 'Alignments', type: 'income', tax_line: 'Gross receipts' },
  { code: '4050', name: 'Flat Repairs', type: 'income', tax_line: 'Gross receipts' },
  { code: '4060', name: 'General Retail', type: 'income', tax_line: 'Gross receipts' },
  { code: '4090', name: 'Other Shop Income', type: 'income', tax_line: 'Other income' },
  // COGS
  { code: '5010', name: 'Tire & Wheel Purchases', type: 'cogs', tax_line: 'COGS — purchases' },
  { code: '5020', name: 'Shop Supplies & Consumables', type: 'cogs', tax_line: 'COGS — supplies' },
  { code: '5030', name: 'Freight-In', type: 'cogs', tax_line: 'COGS — freight' },
  // Operating expenses
  { code: '6010', name: 'Rent', type: 'expense', tax_line: 'Rents' },
  { code: '6020', name: 'Utilities', type: 'expense', tax_line: 'Utilities' },
  { code: '6030', name: 'Wages & Salaries', type: 'expense', tax_line: 'Salaries & wages' },
  { code: '6040', name: 'Payroll Taxes', type: 'expense', tax_line: 'Taxes & licenses' },
  { code: '6050', name: 'Insurance', type: 'expense', tax_line: 'Insurance' },
  { code: '6060', name: 'Advertising', type: 'expense', tax_line: 'Advertising' },
  { code: '6070', name: 'Equipment Repairs & Maintenance', type: 'expense', tax_line: 'Repairs & maintenance' },
  { code: '6080', name: 'Tire / Waste Disposal Fees', type: 'expense', tax_line: 'Other deductions' },
  { code: '6090', name: 'Vehicle & Fuel', type: 'expense', tax_line: 'Other deductions' },
  { code: '6100', name: 'Bank & Merchant Fees', type: 'expense', tax_line: 'Other deductions' },
  { code: '6110', name: 'Software & Office', type: 'expense', tax_line: 'Other deductions' },
  { code: '6120', name: 'Professional Fees', type: 'expense', tax_line: 'Legal & professional' },
  { code: '6130', name: 'Licenses & Permits', type: 'expense', tax_line: 'Taxes & licenses' },
  { code: '6140', name: 'Telephone & Internet', type: 'expense', tax_line: 'Other deductions' },
  ...COMMON_STRUCTURAL,
]

// ── General small business (fallback template) ───────────────────────────────
const GENERAL: TemplateAccount[] = [
  { code: '4010', name: 'Sales / Services Income', type: 'income', tax_line: 'Gross receipts' },
  { code: '4090', name: 'Other Income', type: 'income', tax_line: 'Other income' },
  { code: '5010', name: 'Cost of Goods / Materials', type: 'cogs', tax_line: 'COGS — purchases' },
  { code: '6010', name: 'Rent', type: 'expense', tax_line: 'Rents' },
  { code: '6020', name: 'Utilities', type: 'expense', tax_line: 'Utilities' },
  { code: '6030', name: 'Wages & Salaries', type: 'expense', tax_line: 'Salaries & wages' },
  { code: '6040', name: 'Payroll Taxes', type: 'expense', tax_line: 'Taxes & licenses' },
  { code: '6050', name: 'Insurance', type: 'expense', tax_line: 'Insurance' },
  { code: '6060', name: 'Advertising & Marketing', type: 'expense', tax_line: 'Advertising' },
  { code: '6090', name: 'Vehicle & Fuel', type: 'expense', tax_line: 'Car & truck' },
  { code: '6100', name: 'Bank & Merchant Fees', type: 'expense', tax_line: 'Other deductions' },
  { code: '6110', name: 'Software & Office', type: 'expense', tax_line: 'Office expense' },
  { code: '6120', name: 'Professional Fees', type: 'expense', tax_line: 'Legal & professional' },
  { code: '6130', name: 'Licenses & Permits', type: 'expense', tax_line: 'Taxes & licenses' },
  { code: '6140', name: 'Telephone & Internet', type: 'expense', tax_line: 'Utilities' },
  ...COMMON_STRUCTURAL,
]

// Operating expenses common to most storefront / service businesses.
const COMMON_EXPENSES: TemplateAccount[] = [
  { code: '6010', name: 'Rent', type: 'expense', tax_line: 'Rents' },
  { code: '6020', name: 'Utilities', type: 'expense', tax_line: 'Utilities' },
  { code: '6030', name: 'Wages & Salaries', type: 'expense', tax_line: 'Salaries & wages' },
  { code: '6040', name: 'Payroll Taxes', type: 'expense', tax_line: 'Taxes & licenses' },
  { code: '6050', name: 'Insurance', type: 'expense', tax_line: 'Insurance' },
  { code: '6060', name: 'Advertising & Marketing', type: 'expense', tax_line: 'Advertising' },
  { code: '6070', name: 'Repairs & Maintenance', type: 'expense', tax_line: 'Repairs & maintenance' },
  { code: '6100', name: 'Bank & Merchant Fees', type: 'expense', tax_line: 'Other deductions' },
  { code: '6110', name: 'Software & Office', type: 'expense', tax_line: 'Office expense' },
  { code: '6120', name: 'Professional Fees', type: 'expense', tax_line: 'Legal & professional' },
  { code: '6130', name: 'Licenses & Permits', type: 'expense', tax_line: 'Taxes & licenses' },
  { code: '6140', name: 'Telephone & Internet', type: 'expense', tax_line: 'Utilities' },
]

// ── Restaurant / food service ────────────────────────────────────────────────
const RESTAURANT: TemplateAccount[] = [
  { code: '4010', name: 'Food Sales', type: 'income', tax_line: 'Gross receipts' },
  { code: '4020', name: 'Beverage Sales (Non-Alcoholic)', type: 'income', tax_line: 'Gross receipts' },
  { code: '4030', name: 'Alcohol Sales', type: 'income', tax_line: 'Gross receipts' },
  { code: '4040', name: 'Catering', type: 'income', tax_line: 'Gross receipts' },
  { code: '4050', name: 'Delivery / Takeout', type: 'income', tax_line: 'Gross receipts' },
  { code: '4090', name: 'Other Income', type: 'income', tax_line: 'Other income' },
  { code: '5010', name: 'Food Cost', type: 'cogs', tax_line: 'COGS — purchases' },
  { code: '5020', name: 'Beverage Cost', type: 'cogs', tax_line: 'COGS — purchases' },
  { code: '5030', name: 'Paper & Packaging', type: 'cogs', tax_line: 'COGS — supplies' },
  ...COMMON_EXPENSES,
  { code: '6075', name: 'Waste / Grease Disposal', type: 'expense', tax_line: 'Other deductions' },
  { code: '6085', name: 'Delivery-App Fees', type: 'expense', tax_line: 'Other deductions' },
  ...COMMON_STRUCTURAL,
]

// ── Retail store ─────────────────────────────────────────────────────────────
const RETAIL: TemplateAccount[] = [
  { code: '4010', name: 'Merchandise Sales', type: 'income', tax_line: 'Gross receipts' },
  { code: '4020', name: 'Online Sales', type: 'income', tax_line: 'Gross receipts' },
  { code: '4030', name: 'Shipping Income', type: 'income', tax_line: 'Gross receipts' },
  { code: '4090', name: 'Other Income', type: 'income', tax_line: 'Other income' },
  { code: '5010', name: 'Cost of Goods Sold', type: 'cogs', tax_line: 'COGS — purchases' },
  { code: '5020', name: 'Freight-In', type: 'cogs', tax_line: 'COGS — freight' },
  ...COMMON_EXPENSES,
  ...COMMON_STRUCTURAL,
]

// ── Professional services ────────────────────────────────────────────────────
const PROFESSIONAL: TemplateAccount[] = [
  { code: '4010', name: 'Consulting / Service Fees', type: 'income', tax_line: 'Gross receipts' },
  { code: '4020', name: 'Retainer Income', type: 'income', tax_line: 'Gross receipts' },
  { code: '4030', name: 'Reimbursed Expenses', type: 'income', tax_line: 'Gross receipts' },
  { code: '4090', name: 'Other Income', type: 'income', tax_line: 'Other income' },
  { code: '5010', name: 'Subcontractor / Contract Labor', type: 'cogs', tax_line: 'COGS — labor' },
  ...COMMON_EXPENSES,
  ...COMMON_STRUCTURAL,
]

// ── Salon / spa ──────────────────────────────────────────────────────────────
const SALON: TemplateAccount[] = [
  { code: '4010', name: 'Hair Services', type: 'income', tax_line: 'Gross receipts' },
  { code: '4020', name: 'Color Services', type: 'income', tax_line: 'Gross receipts' },
  { code: '4030', name: 'Nail Services', type: 'income', tax_line: 'Gross receipts' },
  { code: '4040', name: 'Spa / Facials', type: 'income', tax_line: 'Gross receipts' },
  { code: '4050', name: 'Retail Product Sales', type: 'income', tax_line: 'Gross receipts' },
  { code: '4060', name: 'Booth Rental Income', type: 'income', tax_line: 'Rents' },
  { code: '4090', name: 'Other Income', type: 'income', tax_line: 'Other income' },
  { code: '5010', name: 'Product & Supply Cost', type: 'cogs', tax_line: 'COGS — supplies' },
  ...COMMON_EXPENSES,
  ...COMMON_STRUCTURAL,
]

export const CHART_TEMPLATES: Record<string, ChartTemplate> = {
  tire_shop: {
    key: 'tire_shop',
    label: 'Tire shop (retail + service)',
    description: 'New/used tire & wheel sales, service labor, alignments — with COGS and shop supplies.',
    accounts: TIRE_SHOP,
  },
  restaurant: {
    key: 'restaurant',
    label: 'Restaurant / food service',
    description: 'Food, beverage, alcohol, catering & delivery — with food/beverage COGS.',
    accounts: RESTAURANT,
  },
  retail: {
    key: 'retail',
    label: 'Retail store',
    description: 'In-store and online merchandise sales with cost of goods sold.',
    accounts: RETAIL,
  },
  professional: {
    key: 'professional',
    label: 'Professional services',
    description: 'Consulting / service fees and retainers, light on COGS.',
    accounts: PROFESSIONAL,
  },
  salon: {
    key: 'salon',
    label: 'Salon / spa',
    description: 'Hair, color, nail and spa services, product sales and booth rental.',
    accounts: SALON,
  },
  general: {
    key: 'general',
    label: 'General small business',
    description: 'A neutral starter chart for any small business.',
    accounts: GENERAL,
  },
}

export const DEFAULT_TEMPLATE_KEY = 'general'

// Best-guess template for a newly created entity, from NAICS. Extend as needed.
export function suggestedTemplateKey(_entityType?: string | null, naics?: string | null): string {
  if (!naics) return DEFAULT_TEMPLATE_KEY
  if (naics.startsWith('441320') || naics.startsWith('8111')) return 'tire_shop' // tire dealers / auto repair
  if (naics.startsWith('722')) return 'restaurant' // food service & drinking places
  if (naics.startsWith('44') || naics.startsWith('45')) return 'retail' // retail trade
  if (naics.startsWith('8121')) return 'salon' // personal care services
  if (naics.startsWith('54')) return 'professional' // professional/scientific/technical
  return DEFAULT_TEMPLATE_KEY
}
