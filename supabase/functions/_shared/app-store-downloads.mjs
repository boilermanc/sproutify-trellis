export const REKKRD_APPLE_ID = '6795955100';
export const DOWNLOAD_REPORT = 'App Downloads Standard';
export const isDownloadReport = name => name === DOWNLOAD_REPORT || name === 'App Store Downloads Standard';
export function processingWindowStart(lastSyncedAt, hasCanonicalData, now = Date.now()) {
  const synced = Date.parse(lastSyncedAt || '');
  // New processing dates carry Apple's corrections for older event dates.
  // Only use the watermark after the new collector has saved canonical data.
  const start = hasCanonicalData && Number.isFinite(synced) && synced <= now
    ? Math.max(now - 95 * 86400000, synced - 3 * 86400000)
    : now - 95 * 86400000;
  return new Date(start).toISOString().slice(0, 10);
}
const TYPES = { 'first-time download': 'First-Time Downloads', redownload: 'Redownloads', 'manual update': 'Manual Updates', 'auto-update': 'Auto Updates', restore: 'Restores' };

// Standard reports contain only tab-separated dimensions and counts. Reject a
// changed schema instead of reporting a successful import of misleading zeros.
export function parseDownloadTsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.length);
  if (!lines.length) throw new Error('Apple download report is empty.');
  const headers = lines.shift().split('\t');
  for (const name of ['Date', 'App Apple Identifier', 'Download Type', 'Territory', 'Counts']) {
    if (!headers.includes(name)) throw new Error(`Apple download report is missing ${name}.`);
  }
  return lines.map(line => {
    const cells = line.split('\t');
    if (cells.length !== headers.length) throw new Error('Apple download report contains an incomplete row.');
    return Object.fromEntries(headers.map((name, index) => [name, cells[index]]));
  });
}

export function aggregateDownloads(rows, appleAppId = REKKRD_APPLE_ID) {
  const dates = new Map();
  for (const row of rows) {
    if (row['App Apple Identifier'] !== appleAppId) continue;
    const date = row.Date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Invalid Apple report date.');
    const metric = TYPES[String(row['Download Type']).trim().toLowerCase()];
    if (!metric) throw new Error(`Unknown Apple download type: ${String(row['Download Type']).replace(/[^a-zA-Z -]/g, '').slice(0, 50)}.`);
    if (!/^\d+$/.test(row.Counts) || !Number.isSafeInteger(Number(row.Counts))) throw new Error('Invalid Apple download count.');
    const count = Number(row.Counts);
    const metrics = dates.get(date) || { 'First-Time Downloads': 0, Redownloads: 0, Updates: 0, 'Manual Updates': 0, 'Auto Updates': 0, Restores: 0, 'Total Downloads': 0 };
    metrics[metric] += count;
    const territory = row.Territory || 'Unknown';
    const countryKey = `Territory:${territory}:${metric}`;
    metrics[countryKey] = (metrics[countryKey] || 0) + count;
    if (metric === 'First-Time Downloads' || metric === 'Redownloads') metrics['Total Downloads'] += count;
    if (metric === 'Manual Updates' || metric === 'Auto Updates') metrics.Updates += count;
    dates.set(date, metrics);
  }
  return dates;
}

// Both snapshot and ongoing requests can cover the same event dates. Each
// complete instance replaces that date's JSON as a unit, including countries
// removed by a correction. Never sum overlapping processing dates.
export function selectLatestDownloadDates(instances) {
  const selected = new Map();
  for (const instance of instances) {
    for (const [date, metrics] of instance.dates) {
      const previous = selected.get(date);
      if (!previous || instance.processingDate > previous.processingDate) {
        selected.set(date, { metrics, processingDate: instance.processingDate, instanceId: instance.instanceId });
      }
    }
  }
  return selected;
}
