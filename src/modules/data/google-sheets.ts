import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Google Sheets Module
 *
 * Read, write, and manage Google Sheets
 * - Read rows and cells
 * - Write and update data
 * - Add new rows
 * - Query and filter data
 * - Built-in resilience
 *
 * Perfect for:
 * - Data collection and logging
 * - CRM and lead tracking
 * - Report generation
 * - Collaborative data management
 */

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
  logger.warn(
    '⚠️  GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY not set. Google Sheets features will not work.'
  );
}

// Rate limiter: Google Sheets API allows 100 req/100 seconds per user
const sheetsRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 1000, // 1 second between requests
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 100 * 1000, // 100 seconds
  id: 'google-sheets',
});

/**
 * Get authenticated Google Sheets document
 */
async function getSheet(spreadsheetId: string, sheetTitle?: string) {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    throw new Error(
      'Google Sheets not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.'
    );
  }

  const serviceAccountAuth = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
  await doc.loadInfo();

  logger.info(
    { spreadsheetId, title: doc.title, sheetCount: doc.sheetCount },
    'Loaded Google Spreadsheet'
  );

  if (sheetTitle) {
    const sheet = doc.sheetsByTitle[sheetTitle];
    if (!sheet) {
      throw new Error(`Sheet "${sheetTitle}" not found in spreadsheet`);
    }
    return sheet;
  }

  return doc.sheetsByIndex[0]; // Return first sheet by default
}

export interface GoogleSheetsRow {
  [key: string]: string | number | boolean;
}

/**
 * Read rows from sheet
 */
async function getRowsInternal(
  spreadsheetId: string,
  sheetTitle?: string,
  options?: {
    offset?: number;
    limit?: number;
  }
): Promise<GoogleSheetsRow[]> {
  logger.info(
    { spreadsheetId, sheetTitle, options },
    'Reading rows from Google Sheets'
  );

  const sheet = await getSheet(spreadsheetId, sheetTitle);
  const rows = await sheet.getRows({ offset: options?.offset, limit: options?.limit });

  logger.info({ rowCount: rows.length }, 'Rows retrieved from Google Sheets');

  return rows.map((row) => row.toObject() as GoogleSheetsRow);
}

/**
 * Get rows (protected)
 */
const getRowsWithBreaker = createCircuitBreaker(getRowsInternal, {
  timeout: 15000,
  name: 'sheets-get-rows',
});

const getRowsRateLimited = withRateLimit(
  async (
    spreadsheetId: string,
    sheetTitle?: string,
    options?: { offset?: number; limit?: number }
  ) => getRowsWithBreaker.fire(spreadsheetId, sheetTitle, options),
  sheetsRateLimiter
);

export async function getRows(
  spreadsheetId: string,
  sheetTitle?: string,
  options?: {
    offset?: number;
    limit?: number;
  }
): Promise<GoogleSheetsRow[]> {
  return (await getRowsRateLimited(
    spreadsheetId,
    sheetTitle,
    options
  )) as unknown as GoogleSheetsRow[];
}

/**
 * Add row to sheet
 */
export async function addRow(
  spreadsheetId: string,
  data: GoogleSheetsRow,
  sheetTitle?: string
): Promise<void> {
  logger.info({ spreadsheetId, sheetTitle, data }, 'Adding row to Google Sheets');

  const sheet = await getSheet(spreadsheetId, sheetTitle);
  await sheet.addRow(data);

  logger.info('Row added to Google Sheets');
}

/**
 * Add multiple rows to sheet
 */
export async function addRows(
  spreadsheetId: string,
  rows: GoogleSheetsRow[],
  sheetTitle?: string
): Promise<void> {
  logger.info(
    { spreadsheetId, sheetTitle, rowCount: rows.length },
    'Adding multiple rows to Google Sheets'
  );

  const sheet = await getSheet(spreadsheetId, sheetTitle);
  await sheet.addRows(rows);

  logger.info({ rowCount: rows.length }, 'Rows added to Google Sheets');
}

/**
 * Update row by index (0-based, excluding header)
 */
export async function updateRow(
  spreadsheetId: string,
  rowIndex: number,
  data: GoogleSheetsRow,
  sheetTitle?: string
): Promise<void> {
  logger.info(
    { spreadsheetId, sheetTitle, rowIndex, data },
    'Updating row in Google Sheets'
  );

  const sheet = await getSheet(spreadsheetId, sheetTitle);
  const rows = await sheet.getRows();

  if (rowIndex >= rows.length) {
    throw new Error(`Row index ${rowIndex} out of bounds (max: ${rows.length - 1})`);
  }

  const row = rows[rowIndex];
  Object.assign(row, data);
  await row.save();

  logger.info('Row updated in Google Sheets');
}

/**
 * Delete row by index (0-based, excluding header)
 */
export async function deleteRow(
  spreadsheetId: string,
  rowIndex: number,
  sheetTitle?: string
): Promise<void> {
  logger.info({ spreadsheetId, sheetTitle, rowIndex }, 'Deleting row from Google Sheets');

  const sheet = await getSheet(spreadsheetId, sheetTitle);
  const rows = await sheet.getRows();

  if (rowIndex >= rows.length) {
    throw new Error(`Row index ${rowIndex} out of bounds (max: ${rows.length - 1})`);
  }

  await rows[rowIndex].delete();

  logger.info('Row deleted from Google Sheets');
}

/**
 * Clear all rows (keep headers)
 */
export async function clearSheet(
  spreadsheetId: string,
  sheetTitle?: string
): Promise<void> {
  logger.info({ spreadsheetId, sheetTitle }, 'Clearing Google Sheets');

  const sheet = await getSheet(spreadsheetId, sheetTitle);
  await sheet.clear();

  logger.info('Google Sheet cleared');
}

/**
 * Get cell value
 */
export async function getCellValue(
  spreadsheetId: string,
  cellAddress: string,
  sheetTitle?: string
): Promise<unknown> {
  logger.info(
    { spreadsheetId, sheetTitle, cellAddress },
    'Getting cell value from Google Sheets'
  );

  const sheet = await getSheet(spreadsheetId, sheetTitle);
  await sheet.loadCells(cellAddress);

  // Parse cell address like "A1"
  const match = cellAddress.match(/([A-Z]+)(\d+)/);
  if (!match) {
    throw new Error(`Invalid cell address: ${cellAddress}`);
  }

  const col = match[1];
  const row = parseInt(match[2], 10) - 1;

  // Convert column letter to index (A=0, B=1, etc.)
  let colIndex = 0;
  for (let i = 0; i < col.length; i++) {
    colIndex = colIndex * 26 + (col.charCodeAt(i) - 65 + 1);
  }
  colIndex -= 1;

  const cell = sheet.getCell(row, colIndex);

  logger.info({ cellAddress, value: cell.value }, 'Cell value retrieved');

  return cell.value;
}

/**
 * Set cell value
 */
export async function setCellValue(
  spreadsheetId: string,
  cellAddress: string,
  value: string | number | boolean,
  sheetTitle?: string
): Promise<void> {
  logger.info(
    { spreadsheetId, sheetTitle, cellAddress, value },
    'Setting cell value in Google Sheets'
  );

  const sheet = await getSheet(spreadsheetId, sheetTitle);
  await sheet.loadCells(cellAddress);

  // Parse cell address like "A1"
  const match = cellAddress.match(/([A-Z]+)(\d+)/);
  if (!match) {
    throw new Error(`Invalid cell address: ${cellAddress}`);
  }

  const col = match[1];
  const row = parseInt(match[2], 10) - 1;

  // Convert column letter to index (A=0, B=1, etc.)
  let colIndex = 0;
  for (let i = 0; i < col.length; i++) {
    colIndex = colIndex * 26 + (col.charCodeAt(i) - 65 + 1);
  }
  colIndex -= 1;

  const cell = sheet.getCell(row, colIndex);
  cell.value = value as never;
  await sheet.saveUpdatedCells();

  logger.info('Cell value updated in Google Sheets');
}

/**
 * Query rows with filter (simple filter on one column)
 */
export async function queryRows(
  spreadsheetId: string,
  filterColumn: string,
  filterValue: string | number | boolean,
  sheetTitle?: string
): Promise<GoogleSheetsRow[]> {
  logger.info(
    { spreadsheetId, sheetTitle, filterColumn, filterValue },
    'Querying rows from Google Sheets'
  );

  const rows = await getRows(spreadsheetId, sheetTitle);
  const filtered = rows.filter((row) => row[filterColumn] === filterValue);

  logger.info({ resultCount: filtered.length }, 'Query results retrieved');

  return filtered;
}
