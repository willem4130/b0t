import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * QuickBooks Online Module
 *
 * Manage accounting operations, invoices, customers, and financial reports
 * - Create/update invoices
 * - Create/update customers
 * - Record payments
 * - Get profit & loss reports
 * - Get balance sheet
 * - Query financial data
 * - Built-in resilience
 *
 * Perfect for:
 * - Automated invoicing workflows
 * - Payment tracking
 * - Financial reporting automation
 * - Customer billing management
 */

const QUICKBOOKS_ACCESS_TOKEN = process.env.QUICKBOOKS_ACCESS_TOKEN;
const QUICKBOOKS_REALM_ID = process.env.QUICKBOOKS_REALM_ID;
const QUICKBOOKS_BASE_URL = process.env.QUICKBOOKS_BASE_URL || 'https://quickbooks.api.intuit.com';

if (!QUICKBOOKS_ACCESS_TOKEN || !QUICKBOOKS_REALM_ID) {
  logger.warn(
    '⚠️  QUICKBOOKS_ACCESS_TOKEN or QUICKBOOKS_REALM_ID not set. QuickBooks features will not work.'
  );
}

// Rate limiter: QuickBooks has rate limits per app/realm
const quickbooksRateLimiter = createRateLimiter({
  maxConcurrent: 3,
  minTime: 300, // 300ms between requests
  reservoir: 30,
  reservoirRefreshAmount: 30,
  reservoirRefreshInterval: 10000,
  id: 'quickbooks',
});

export interface QuickBooksCustomer {
  Id?: string;
  DisplayName: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  [key: string]: unknown;
}

export interface QuickBooksInvoice {
  Id?: string;
  CustomerRef: { value: string };
  Line: Array<{
    Amount: number;
    DetailType: 'SalesItemLineDetail';
    SalesItemLineDetail: {
      ItemRef: { value: string };
      Qty?: number;
      UnitPrice?: number;
    };
    Description?: string;
  }>;
  DueDate?: string;
  TxnDate?: string;
  DocNumber?: string;
  [key: string]: unknown;
}

export interface QuickBooksPayment {
  Id?: string;
  CustomerRef: { value: string };
  TotalAmt: number;
  TxnDate?: string;
  Line?: Array<{
    Amount: number;
    LinkedTxn?: Array<{
      TxnId: string;
      TxnType: 'Invoice';
    }>;
  }>;
  [key: string]: unknown;
}

export interface QuickBooksItem {
  Id?: string;
  Name: string;
  Type: 'Service' | 'Inventory' | 'NonInventory';
  IncomeAccountRef?: { value: string };
  UnitPrice?: number;
  [key: string]: unknown;
}

/**
 * Make authenticated request to QuickBooks API
 */
async function makeQuickBooksRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  if (!QUICKBOOKS_ACCESS_TOKEN || !QUICKBOOKS_REALM_ID) {
    throw new Error(
      'QuickBooks credentials not configured. Set QUICKBOOKS_ACCESS_TOKEN and QUICKBOOKS_REALM_ID.'
    );
  }

  const url = `${QUICKBOOKS_BASE_URL}/v3/company/${QUICKBOOKS_REALM_ID}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${QUICKBOOKS_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  logger.info({ method, endpoint }, 'Making QuickBooks API request');

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`QuickBooks API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}

/**
 * Create customer
 */
async function createCustomerInternal(
  customer: QuickBooksCustomer
): Promise<QuickBooksCustomer> {
  logger.info({ displayName: customer.DisplayName }, 'Creating QuickBooks customer');

  const result = await makeQuickBooksRequest<{ Customer: QuickBooksCustomer }>(
    '/customer',
    'POST',
    customer
  );

  logger.info({ customerId: result.Customer.Id }, 'QuickBooks customer created');
  return result.Customer;
}

const createCustomerWithBreaker = createCircuitBreaker(createCustomerInternal, {
  timeout: 15000,
  name: 'quickbooks-create-customer',
});

const createCustomerRateLimited = withRateLimit(
  async (customer: QuickBooksCustomer) => createCustomerWithBreaker.fire(customer),
  quickbooksRateLimiter
);

export async function createCustomer(
  customer: QuickBooksCustomer
): Promise<QuickBooksCustomer> {
  return (await createCustomerRateLimited(customer)) as unknown as QuickBooksCustomer;
}

/**
 * Get customer by ID
 */
export async function getCustomer(customerId: string): Promise<QuickBooksCustomer> {
  logger.info({ customerId }, 'Getting QuickBooks customer');

  const result = await makeQuickBooksRequest<{ Customer: QuickBooksCustomer }>(
    `/customer/${customerId}`,
    'GET'
  );

  logger.info({ customerId: result.Customer.Id }, 'QuickBooks customer retrieved');
  return result.Customer;
}

/**
 * Query customers
 */
export async function queryCustomers(
  query: string = 'SELECT * FROM Customer'
): Promise<QuickBooksCustomer[]> {
  logger.info({ query }, 'Querying QuickBooks customers');

  const result = await makeQuickBooksRequest<{
    QueryResponse: { Customer?: QuickBooksCustomer[] };
  }>(`/query?query=${encodeURIComponent(query)}`, 'GET');

  const customers = result.QueryResponse.Customer || [];
  logger.info({ customerCount: customers.length }, 'QuickBooks customers retrieved');
  return customers;
}

/**
 * Create invoice
 */
export async function createInvoice(
  invoice: QuickBooksInvoice
): Promise<QuickBooksInvoice> {
  logger.info(
    { customerId: invoice.CustomerRef.value },
    'Creating QuickBooks invoice'
  );

  const result = await makeQuickBooksRequest<{ Invoice: QuickBooksInvoice }>(
    '/invoice',
    'POST',
    invoice
  );

  logger.info({ invoiceId: result.Invoice.Id }, 'QuickBooks invoice created');
  return result.Invoice;
}

/**
 * Get invoice by ID
 */
export async function getInvoice(invoiceId: string): Promise<QuickBooksInvoice> {
  logger.info({ invoiceId }, 'Getting QuickBooks invoice');

  const result = await makeQuickBooksRequest<{ Invoice: QuickBooksInvoice }>(
    `/invoice/${invoiceId}`,
    'GET'
  );

  logger.info({ invoiceId: result.Invoice.Id }, 'QuickBooks invoice retrieved');
  return result.Invoice;
}

/**
 * Query invoices
 */
export async function queryInvoices(
  query: string = 'SELECT * FROM Invoice'
): Promise<QuickBooksInvoice[]> {
  logger.info({ query }, 'Querying QuickBooks invoices');

  const result = await makeQuickBooksRequest<{
    QueryResponse: { Invoice?: QuickBooksInvoice[] };
  }>(`/query?query=${encodeURIComponent(query)}`, 'GET');

  const invoices = result.QueryResponse.Invoice || [];
  logger.info({ invoiceCount: invoices.length }, 'QuickBooks invoices retrieved');
  return invoices;
}

/**
 * Send invoice via email
 */
export async function sendInvoice(
  invoiceId: string,
  emailAddress: string
): Promise<QuickBooksInvoice> {
  logger.info({ invoiceId, emailAddress }, 'Sending QuickBooks invoice');

  const result = await makeQuickBooksRequest<{ Invoice: QuickBooksInvoice }>(
    `/invoice/${invoiceId}/send?sendTo=${encodeURIComponent(emailAddress)}`,
    'POST'
  );

  logger.info({ invoiceId: result.Invoice.Id }, 'QuickBooks invoice sent');
  return result.Invoice;
}

/**
 * Create payment
 */
export async function createPayment(
  payment: QuickBooksPayment
): Promise<QuickBooksPayment> {
  logger.info(
    { customerId: payment.CustomerRef.value, amount: payment.TotalAmt },
    'Creating QuickBooks payment'
  );

  const result = await makeQuickBooksRequest<{ Payment: QuickBooksPayment }>(
    '/payment',
    'POST',
    payment
  );

  logger.info({ paymentId: result.Payment.Id }, 'QuickBooks payment created');
  return result.Payment;
}

/**
 * Get payment by ID
 */
export async function getPayment(paymentId: string): Promise<QuickBooksPayment> {
  logger.info({ paymentId }, 'Getting QuickBooks payment');

  const result = await makeQuickBooksRequest<{ Payment: QuickBooksPayment }>(
    `/payment/${paymentId}`,
    'GET'
  );

  logger.info({ paymentId: result.Payment.Id }, 'QuickBooks payment retrieved');
  return result.Payment;
}

/**
 * Get profit and loss report
 */
export async function getProfitAndLoss(options?: {
  startDate?: string;
  endDate?: string;
  accountingMethod?: 'Accrual' | 'Cash';
}): Promise<{
  Header: { ReportName: string; DateMacro: string };
  Rows: { Row: unknown[] };
}> {
  logger.info('Getting QuickBooks profit and loss report');

  let endpoint = '/reports/ProfitAndLoss';
  const params: string[] = [];

  if (options?.startDate) params.push(`start_date=${options.startDate}`);
  if (options?.endDate) params.push(`end_date=${options.endDate}`);
  if (options?.accountingMethod) params.push(`accounting_method=${options.accountingMethod}`);

  if (params.length > 0) {
    endpoint += `?${params.join('&')}`;
  }

  const result = await makeQuickBooksRequest<{
    Header: { ReportName: string; DateMacro: string };
    Rows: { Row: unknown[] };
  }>(endpoint, 'GET');

  logger.info('QuickBooks profit and loss report retrieved');
  return result;
}

/**
 * Get balance sheet
 */
export async function getBalanceSheet(options?: {
  date?: string;
  accountingMethod?: 'Accrual' | 'Cash';
}): Promise<{
  Header: { ReportName: string; DateMacro: string };
  Rows: { Row: unknown[] };
}> {
  logger.info('Getting QuickBooks balance sheet');

  let endpoint = '/reports/BalanceSheet';
  const params: string[] = [];

  if (options?.date) params.push(`date=${options.date}`);
  if (options?.accountingMethod) params.push(`accounting_method=${options.accountingMethod}`);

  if (params.length > 0) {
    endpoint += `?${params.join('&')}`;
  }

  const result = await makeQuickBooksRequest<{
    Header: { ReportName: string; DateMacro: string };
    Rows: { Row: unknown[] };
  }>(endpoint, 'GET');

  logger.info('QuickBooks balance sheet retrieved');
  return result;
}

/**
 * Create item (product/service)
 */
export async function createItem(item: QuickBooksItem): Promise<QuickBooksItem> {
  logger.info({ name: item.Name, type: item.Type }, 'Creating QuickBooks item');

  const result = await makeQuickBooksRequest<{ Item: QuickBooksItem }>(
    '/item',
    'POST',
    item
  );

  logger.info({ itemId: result.Item.Id }, 'QuickBooks item created');
  return result.Item;
}

/**
 * Get company info
 */
export async function getCompanyInfo(): Promise<{
  CompanyName: string;
  LegalName: string;
  Country: string;
  Email: { Address: string };
}> {
  logger.info('Getting QuickBooks company info');

  const result = await makeQuickBooksRequest<{
    CompanyInfo: {
      CompanyName: string;
      LegalName: string;
      Country: string;
      Email: { Address: string };
    };
  }>('/companyinfo/1', 'GET');

  logger.info('QuickBooks company info retrieved');
  return result.CompanyInfo;
}
