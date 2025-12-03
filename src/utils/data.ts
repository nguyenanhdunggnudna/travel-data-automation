export function formatDepartureDate(raw?: string): string {
  if (!raw) return '';

  // raw: "03-Dec-2025"
  const match = raw.match(/^(\d{2})-([a-zA-Z]{3})-(\d{4})$/);
  if (!match) return '';

  const day = match[1];
  const monthStr = match[2].toLowerCase();

  const monthMap: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12'
  };

  const month = monthMap[monthStr];
  return month ? `${day}/${month}` : '';
}
