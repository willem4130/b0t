import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * FreshBooks Module
 *
 * Manage invoicing, clients, expenses, and financial reports
 * - Create/update invoices
 * - Create/update clients
 * - Record expenses
 * - Track time entries
 * - Get financial reports
 * - Send invoice reminders
 * - Built-in resilience
 *
 * Perfect for:
 * - Freelancer invoicing automation
 * - Client billing workflows
 * - Expense tracking
 * - Time and project management
 */

const FRESHBOOKS_ACCESS_TOKEN = process.env.FRESHBOOKS_ACCESS_TOKEN;
const FRESHBOOKS_ACCOUNT_ID = process.env.FRESHBOOKS_ACCOUNT_ID;
const FRESHBOOKS_BASE_URL = 'https://api.freshbooks.com';

if (!FRESHBOOKS_ACCESS_TOKEN || !FRESHBOOKS_ACCOUNT_ID) {
  logger.warn(
    '⚠️  FRESHBOOKS_ACCESS_TOKEN or FRESHBOOKS_ACCOUNT_ID not set. FreshBooks features will not work.'
  );
}

// Rate limiter: FreshBooks has rate limits per account
const freshbooksRateLimiter = createRateLimiter({
  maxConcurrent: 3,
  minTime: 300, // 300ms between requests
  reservoir: 30,
  reservoirRefreshAmount: 30,
  reservoirRefreshInterval: 10000,
  id: 'freshbooks',
});

export interface FreshBooksClient {
  id?: number;
  fname: string;
  lname: string;
  email: string;
  organization?: string;
  phone?: string;
  currency_code?: string;
  [key: string]: unknown;
}

export interface FreshBooksInvoice {
  id?: number;
  customerid: number;
  create_date?: string;
  due_date?: string;
  status?: number;
  lines: Array<{
    name: string;
    description?: string;
    qty?: number;
    unit_cost?: {
      amount: string;
      code: string;
    };
    amount?: {
      amount: string;
      code: string;
    };
  }>;
  [key: string]: unknown;
}

export interface FreshBooksExpense {
  id?: number;
  categoryid?: number;
  date: string;
  amount: {
    amount: string;
    code: string;
  };
  vendor?: string;
  notes?: string;
  clientid?: number;
  [key: string]: unknown;
}

export interface FreshBooksPayment {
  id?: number;
  invoiceid: number;
  amount: {
    amount: string;
    code: string;
  };
  date: string;
  type: string;
  note?: string;
  [key: string]: unknown;
}

/**
 * Make authenticated request to FreshBooks API
 */
async function makeFreshBooksRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  if (!FRESHBOOKS_ACCESS_TOKEN || !FRESHBOOKS_ACCOUNT_ID) {
    throw new Error(
      'FreshBooks credentials not configured. Set FRESHBOOKS_ACCESS_TOKEN and FRESHBOOKS_ACCOUNT_ID.'
    );
  }

  const url = `${FRESHBOOKS_BASE_URL}/accounting/account/${FRESHBOOKS_ACCOUNT_ID}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${FRESHBOOKS_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Api-Version': 'alpha',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  logger.info({ method, endpoint }, 'Making FreshBooks API request');

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FreshBooks API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}

/**
 * Create client
 */
async function createClientInternal(
  client: FreshBooksClient
): Promise<FreshBooksClient> {
  logger.info({ email: client.email }, 'Creating FreshBooks client');

  const result = await makeFreshBooksRequest<{ response: { result: { client: FreshBooksClient } } }>(
    '/users/clients',
    'POST',
    { client }
  );

  logger.info({ clientId: result.response.result.client.id }, 'FreshBooks client created');
  return result.response.result.client;
}

const createClientWithBreaker = createCircuitBreaker(createClientInternal, {
  timeout: 15000,
  name: 'freshbooks-create-client',
});

const createClientRateLimited = withRateLimit(
  async (client: FreshBooksClient) => createClientWithBreaker.fire(client),
  freshbooksRateLimiter
);

export async function createClient(
  client: FreshBooksClient
): Promise<FreshBooksClient> {
  return (await createClientRateLimited(client)) as unknown as FreshBooksClient;
}

/**
 * Get client by ID
 */
export async function getClient(clientId: number): Promise<FreshBooksClient> {
  logger.info({ clientId }, 'Getting FreshBooks client');

  const result = await makeFreshBooksRequest<{ response: { result: { client: FreshBooksClient } } }>(
    `/users/clients/${clientId}`,
    'GET'
  );

  logger.info({ clientId: result.response.result.client.id }, 'FreshBooks client retrieved');
  return result.response.result.client;
}

/**
 * Update client
 */
export async function updateClient(
  clientId: number,
  updates: Partial<FreshBooksClient>
): Promise<FreshBooksClient> {
  logger.info({ clientId }, 'Updating FreshBooks client');

  const result = await makeFreshBooksRequest<{ response: { result: { client: FreshBooksClient } } }>(
    `/users/clients/${clientId}`,
    'PUT',
    { client: updates }
  );

  logger.info({ clientId: result.response.result.client.id }, 'FreshBooks client updated');
  return result.response.result.client;
}

/**
 * List clients
 */
export async function listClients(options?: {
  page?: number;
  perPage?: number;
}): Promise<FreshBooksClient[]> {
  logger.info('Listing FreshBooks clients');

  const params: string[] = [];
  if (options?.page) params.push(`page=${options.page}`);
  if (options?.perPage) params.push(`per_page=${options.perPage}`);

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  const result = await makeFreshBooksRequest<{
    response: { result: { clients: FreshBooksClient[] } };
  }>(`/users/clients${queryString}`, 'GET');

  logger.info(
    { clientCount: result.response.result.clients.length },
    'FreshBooks clients listed'
  );
  return result.response.result.clients;
}

/**
 * Create invoice
 */
export async function createInvoice(
  invoice: FreshBooksInvoice
): Promise<FreshBooksInvoice> {
  logger.info({ customerId: invoice.customerid }, 'Creating FreshBooks invoice');

  const result = await makeFreshBooksRequest<{
    response: { result: { invoice: FreshBooksInvoice } };
  }>('/invoices/invoices', 'POST', { invoice });

  logger.info({ invoiceId: result.response.result.invoice.id }, 'FreshBooks invoice created');
  return result.response.result.invoice;
}

/**
 * Get invoice by ID
 */
export async function getInvoice(invoiceId: number): Promise<FreshBooksInvoice> {
  logger.info({ invoiceId }, 'Getting FreshBooks invoice');

  const result = await makeFreshBooksRequest<{
    response: { result: { invoice: FreshBooksInvoice } };
  }>(`/invoices/invoices/${invoiceId}`, 'GET');

  logger.info({ invoiceId: result.response.result.invoice.id }, 'FreshBooks invoice retrieved');
  return result.response.result.invoice;
}

/**
 * Update invoice
 */
export async function updateInvoice(
  invoiceId: number,
  updates: Partial<FreshBooksInvoice>
): Promise<FreshBooksInvoice> {
  logger.info({ invoiceId }, 'Updating FreshBooks invoice');

  const result = await makeFreshBooksRequest<{
    response: { result: { invoice: FreshBooksInvoice } };
  }>(`/invoices/invoices/${invoiceId}`, 'PUT', { invoice: updates });

  logger.info({ invoiceId: result.response.result.invoice.id }, 'FreshBooks invoice updated');
  return result.response.result.invoice;
}

/**
 * List invoices
 */
export async function listInvoices(options?: {
  page?: number;
  perPage?: number;
  updated_since?: string;
}): Promise<FreshBooksInvoice[]> {
  logger.info('Listing FreshBooks invoices');

  const params: string[] = [];
  if (options?.page) params.push(`page=${options.page}`);
  if (options?.perPage) params.push(`per_page=${options.perPage}`);
  if (options?.updated_since) params.push(`updated_since=${options.updated_since}`);

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  const result = await makeFreshBooksRequest<{
    response: { result: { invoices: FreshBooksInvoice[] } };
  }>(`/invoices/invoices${queryString}`, 'GET');

  logger.info(
    { invoiceCount: result.response.result.invoices.length },
    'FreshBooks invoices listed'
  );
  return result.response.result.invoices;
}

/**
 * Send invoice
 */
export async function sendInvoice(
  invoiceId: number,
  action: 'send_email' | 'mark_sent' = 'send_email'
): Promise<FreshBooksInvoice> {
  logger.info({ invoiceId, action }, 'Sending FreshBooks invoice');

  const result = await makeFreshBooksRequest<{
    response: { result: { invoice: FreshBooksInvoice } };
  }>(`/invoices/invoices/${invoiceId}`, 'PUT', {
    invoice: {
      action,
    },
  });

  logger.info({ invoiceId: result.response.result.invoice.id }, 'FreshBooks invoice sent');
  return result.response.result.invoice;
}

/**
 * Create expense
 */
export async function createExpense(
  expense: FreshBooksExpense
): Promise<FreshBooksExpense> {
  logger.info({ vendor: expense.vendor, amount: expense.amount.amount }, 'Creating FreshBooks expense');

  const result = await makeFreshBooksRequest<{
    response: { result: { expense: FreshBooksExpense } };
  }>('/expenses/expenses', 'POST', { expense });

  logger.info({ expenseId: result.response.result.expense.id }, 'FreshBooks expense created');
  return result.response.result.expense;
}

/**
 * Get expense by ID
 */
export async function getExpense(expenseId: number): Promise<FreshBooksExpense> {
  logger.info({ expenseId }, 'Getting FreshBooks expense');

  const result = await makeFreshBooksRequest<{
    response: { result: { expense: FreshBooksExpense } };
  }>(`/expenses/expenses/${expenseId}`, 'GET');

  logger.info({ expenseId: result.response.result.expense.id }, 'FreshBooks expense retrieved');
  return result.response.result.expense;
}

/**
 * Create payment
 */
export async function createPayment(
  payment: FreshBooksPayment
): Promise<FreshBooksPayment> {
  logger.info(
    { invoiceId: payment.invoiceid, amount: payment.amount.amount },
    'Creating FreshBooks payment'
  );

  const result = await makeFreshBooksRequest<{
    response: { result: { payment: FreshBooksPayment } };
  }>('/payments/payments', 'POST', { payment });

  logger.info({ paymentId: result.response.result.payment.id }, 'FreshBooks payment created');
  return result.response.result.payment;
}

/**
 * Get financial reports summary
 */
export async function getReportsSummary(options?: {
  start_date?: string;
  end_date?: string;
}): Promise<{
  profit: { amount: string; code: string };
  revenue: { amount: string; code: string };
  expenses: { amount: string; code: string };
}> {
  logger.info('Getting FreshBooks reports summary');

  const params: string[] = [];
  if (options?.start_date) params.push(`start_date=${options.start_date}`);
  if (options?.end_date) params.push(`end_date=${options.end_date}`);

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  const result = await makeFreshBooksRequest<{
    response: {
      result: {
        profit: { amount: string; code: string };
        revenue: { amount: string; code: string };
        expenses: { amount: string; code: string };
      };
    };
  }>(`/reports/accounting/profitloss${queryString}`, 'GET');

  logger.info('FreshBooks reports summary retrieved');
  return result.response.result;
}
