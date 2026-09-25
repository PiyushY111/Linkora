/**
 * Quotes a CSV cell and neutralises spreadsheet formulas: exports carry
 * user-controlled text (UTM values, link titles, audit details), and a cell
 * starting with = + - @ would be executed by Excel/Sheets when opened.
 * @param {unknown} value - Dates are written as ISO-8601 UTC
 */
export function csvCell(value) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** One CSV line (with trailing newline) from a list of values. */
export function csvRow(values) {
  return `${values.map(csvCell).join(',')}\n`;
}

/** A filename-safe slug for Content-Disposition (no quotes, slashes or spaces). */
export function filenameSlug(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'export';
}

export default { csvCell, csvRow, filenameSlug };
