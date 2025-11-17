import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Xero Accounting Module
 *
 * Manage accounting operations, invoices, contacts, and financial reports
 * - Create/update invoices
 * - Create/update contacts
 * - Record payments
 * - Get profit & loss reports
 * - Get balance sheet
 * - Track bank transactions
 * - Built-in resilience
 *
 * Perfect for:
 * - Automated accounting workflows
 * - Invoice and payment tracking
 * - Financial reporting automation
 * - Multi-currency operations
 */

const XERO_ACCESS_TOKEN = process.env.XERO_ACCESS_TOKEN;
const XERO_TENANT_ID = process.env.XERO_TENANT_ID;
const XERO_BASE_URL = 'https://api.xero.com/api.xro/2.0';

if (!XERO_ACCESS_TOKEN || !XERO_TENANT_ID) {
  logger.warn(
    '⚠️  XERO_ACCESS_TOKEN or XERO_TENANT_ID not set. Xero features will not work.'
  );
}

// Rate limiter: Xero has rate limits per app/tenant
const xeroRateLimiter = createRateLimiter({
  maxConcurrent: 3,
  minTime: 200, // 200ms between requests
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60000,
  id: 'xero',
});

export interface XeroContact {
  ContactID?: string;
  Name: string;
  EmailAddress?: string;
  FirstName?: string;
  LastName?: string;
  Phones?: Array<{
    PhoneType: 'DEFAULT' | 'DDI' | 'MOBILE' | 'FAX';
    PhoneNumber: string;
  }>;
  Addresses?: Array<{
    AddressType: 'POBOX' | 'STREET';
    City?: string;
    Region?: string;
    PostalCode?: string;
    Country?: string;
  }>;
  [key: string]: unknown;
}

export interface XeroInvoice {
  InvoiceID?: string;
  Type: 'ACCREC' | 'ACCPAY';
  Contact: { ContactID?: string; Name?: string };
  Date?: string;
  DueDate?: string;
  LineItems: Array<{
    Description: string;
    Quantity?: number;
    UnitAmount: number;
    AccountCode?: string;
    TaxType?: string;
  }>;
  Status?: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID';
  Reference?: string;
  [key: string]: unknown;
}

export interface XeroPayment {
  PaymentID?: string;
  Invoice: { InvoiceID: string };
  Account: { Code: string };
  Date: string;
  Amount: number;
  Reference?: string;
  [key: string]: unknown;
}

export interface XeroBankTransaction {
  BankTransactionID?: string;
  Type: 'RECEIVE' | 'SPEND';
  Contact: { ContactID?: string; Name?: string };
  LineItems: Array<{
    Description: string;
    Quantity?: number;
    UnitAmount: number;
    AccountCode: string;
  }>;
  BankAccount: { Code: string };
  Date?: string;
  [key: string]: unknown;
}

/**
 * Make authenticated request to Xero API
 */
async function makeXeroRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  if (!XERO_ACCESS_TOKEN || !XERO_TENANT_ID) {
    throw new Error(
      'Xero credentials not configured. Set XERO_ACCESS_TOKEN and XERO_TENANT_ID.'
    );
  }

  const url = `${XERO_BASE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${XERO_ACCESS_TOKEN}`,
      'xero-tenant-id': XERO_TENANT_ID,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  logger.info({ method, endpoint }, 'Making Xero API request');

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xero API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}

/**
 * Create contact
 */
async function createContactInternal(contact: XeroContact): Promise<XeroContact> {
  logger.info({ name: contact.Name }, 'Creating Xero contact');

  const result = await makeXeroRequest<{ Contacts: XeroContact[] }>(
    '/Contacts',
    'POST',
    { Contacts: [contact] }
  );

  logger.info({ contactId: result.Contacts[0].ContactID }, 'Xero contact created');
  return result.Contacts[0];
}

const createContactWithBreaker = createCircuitBreaker(createContactInternal, {
  timeout: 15000,
  name: 'xero-create-contact',
});

const createContactRateLimited = withRateLimit(
  async (contact: XeroContact) => createContactWithBreaker.fire(contact),
  xeroRateLimiter
);

export async function createContact(contact: XeroContact): Promise<XeroContact> {
  return (await createContactRateLimited(contact)) as unknown as XeroContact;
}

/**
 * Get contact by ID
 */
export async function getContact(contactId: string): Promise<XeroContact> {
  logger.info({ contactId }, 'Getting Xero contact');

  const result = await makeXeroRequest<{ Contacts: XeroContact[] }>(
    `/Contacts/${contactId}`,
    'GET'
  );

  logger.info({ contactId: result.Contacts[0].ContactID }, 'Xero contact retrieved');
  return result.Contacts[0];
}

/**
 * Update contact
 */
export async function updateContact(
  contactId: string,
  updates: Partial<XeroContact>
): Promise<XeroContact> {
  logger.info({ contactId }, 'Updating Xero contact');

  const result = await makeXeroRequest<{ Contacts: XeroContact[] }>(
    `/Contacts/${contactId}`,
    'POST',
    { Contacts: [{ ContactID: contactId, ...updates }] }
  );

  logger.info({ contactId: result.Contacts[0].ContactID }, 'Xero contact updated');
  return result.Contacts[0];
}

/**
 * List contacts
 */
export async function listContacts(options?: {
  where?: string;
  order?: string;
}): Promise<XeroContact[]> {
  logger.info('Listing Xero contacts');

  const params: string[] = [];
  if (options?.where) params.push(`where=${encodeURIComponent(options.where)}`);
  if (options?.order) params.push(`order=${encodeURIComponent(options.order)}`);

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  const result = await makeXeroRequest<{ Contacts: XeroContact[] }>(
    `/Contacts${queryString}`,
    'GET'
  );

  logger.info({ contactCount: result.Contacts.length }, 'Xero contacts listed');
  return result.Contacts;
}

/**
 * Create invoice
 */
export async function createInvoice(invoice: XeroInvoice): Promise<XeroInvoice> {
  logger.info(
    { contactName: invoice.Contact.Name, type: invoice.Type },
    'Creating Xero invoice'
  );

  const result = await makeXeroRequest<{ Invoices: XeroInvoice[] }>(
    '/Invoices',
    'POST',
    { Invoices: [invoice] }
  );

  logger.info({ invoiceId: result.Invoices[0].InvoiceID }, 'Xero invoice created');
  return result.Invoices[0];
}

/**
 * Get invoice by ID
 */
export async function getInvoice(invoiceId: string): Promise<XeroInvoice> {
  logger.info({ invoiceId }, 'Getting Xero invoice');

  const result = await makeXeroRequest<{ Invoices: XeroInvoice[] }>(
    `/Invoices/${invoiceId}`,
    'GET'
  );

  logger.info({ invoiceId: result.Invoices[0].InvoiceID }, 'Xero invoice retrieved');
  return result.Invoices[0];
}

/**
 * Update invoice
 */
export async function updateInvoice(
  invoiceId: string,
  updates: Partial<XeroInvoice>
): Promise<XeroInvoice> {
  logger.info({ invoiceId }, 'Updating Xero invoice');

  const result = await makeXeroRequest<{ Invoices: XeroInvoice[] }>(
    `/Invoices/${invoiceId}`,
    'POST',
    { Invoices: [{ InvoiceID: invoiceId, ...updates }] }
  );

  logger.info({ invoiceId: result.Invoices[0].InvoiceID }, 'Xero invoice updated');
  return result.Invoices[0];
}

/**
 * List invoices
 */
export async function listInvoices(options?: {
  where?: string;
  order?: string;
  status?: string;
}): Promise<XeroInvoice[]> {
  logger.info('Listing Xero invoices');

  const params: string[] = [];
  if (options?.where) params.push(`where=${encodeURIComponent(options.where)}`);
  if (options?.order) params.push(`order=${encodeURIComponent(options.order)}`);
  if (options?.status) {
    const whereClause = `Status=="${options.status}"`;
    params.push(`where=${encodeURIComponent(whereClause)}`);
  }

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  const result = await makeXeroRequest<{ Invoices: XeroInvoice[] }>(
    `/Invoices${queryString}`,
    'GET'
  );

  logger.info({ invoiceCount: result.Invoices.length }, 'Xero invoices listed');
  return result.Invoices;
}

/**
 * Create payment
 */
export async function createPayment(payment: XeroPayment): Promise<XeroPayment> {
  logger.info(
    { invoiceId: payment.Invoice.InvoiceID, amount: payment.Amount },
    'Creating Xero payment'
  );

  const result = await makeXeroRequest<{ Payments: XeroPayment[] }>(
    '/Payments',
    'POST',
    { Payments: [payment] }
  );

  logger.info({ paymentId: result.Payments[0].PaymentID }, 'Xero payment created');
  return result.Payments[0];
}

/**
 * Get payment by ID
 */
export async function getPayment(paymentId: string): Promise<XeroPayment> {
  logger.info({ paymentId }, 'Getting Xero payment');

  const result = await makeXeroRequest<{ Payments: XeroPayment[] }>(
    `/Payments/${paymentId}`,
    'GET'
  );

  logger.info({ paymentId: result.Payments[0].PaymentID }, 'Xero payment retrieved');
  return result.Payments[0];
}

/**
 * Create bank transaction
 */
export async function createBankTransaction(
  transaction: XeroBankTransaction
): Promise<XeroBankTransaction> {
  logger.info(
    { type: transaction.Type, contact: transaction.Contact.Name },
    'Creating Xero bank transaction'
  );

  const result = await makeXeroRequest<{ BankTransactions: XeroBankTransaction[] }>(
    '/BankTransactions',
    'POST',
    { BankTransactions: [transaction] }
  );

  logger.info(
    { transactionId: result.BankTransactions[0].BankTransactionID },
    'Xero bank transaction created'
  );
  return result.BankTransactions[0];
}

/**
 * Get profit and loss report
 */
export async function getProfitAndLoss(options?: {
  fromDate?: string;
  toDate?: string;
}): Promise<{
  ReportID: string;
  ReportName: string;
  ReportTitles: string[];
  ReportDate: string;
  Rows: unknown[];
}> {
  logger.info('Getting Xero profit and loss report');

  const params: string[] = [];
  if (options?.fromDate) params.push(`fromDate=${options.fromDate}`);
  if (options?.toDate) params.push(`toDate=${options.toDate}`);

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  const result = await makeXeroRequest<{
    Reports: Array<{
      ReportID: string;
      ReportName: string;
      ReportTitles: string[];
      ReportDate: string;
      Rows: unknown[];
    }>;
  }>(`/Reports/ProfitAndLoss${queryString}`, 'GET');

  logger.info('Xero profit and loss report retrieved');
  return result.Reports[0];
}

/**
 * Get balance sheet
 */
export async function getBalanceSheet(options?: {
  date?: string;
}): Promise<{
  ReportID: string;
  ReportName: string;
  ReportTitles: string[];
  ReportDate: string;
  Rows: unknown[];
}> {
  logger.info('Getting Xero balance sheet');

  const params: string[] = [];
  if (options?.date) params.push(`date=${options.date}`);

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  const result = await makeXeroRequest<{
    Reports: Array<{
      ReportID: string;
      ReportName: string;
      ReportTitles: string[];
      ReportDate: string;
      Rows: unknown[];
    }>;
  }>(`/Reports/BalanceSheet${queryString}`, 'GET');

  logger.info('Xero balance sheet retrieved');
  return result.Reports[0];
}

/**
 * Get organisation details
 */
export async function getOrganisation(): Promise<{
  OrganisationID: string;
  Name: string;
  LegalName: string;
  CountryCode: string;
  BaseCurrency: string;
}> {
  logger.info('Getting Xero organisation details');

  const result = await makeXeroRequest<{
    Organisations: Array<{
      OrganisationID: string;
      Name: string;
      LegalName: string;
      CountryCode: string;
      BaseCurrency: string;
    }>;
  }>('/Organisation', 'GET');

  logger.info('Xero organisation details retrieved');
  return result.Organisations[0];
}
