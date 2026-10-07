export function formatNumber(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value === null || value === undefined) return 'N/A';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value === null || value === undefined) return 'N/A';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  const sign = num < 0 ? '-' : '';
  const absNum = Math.abs(num);
  return (
    sign +
    '$' +
    absNum.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function formatSignedCurrencyValue(
  value: number | null | undefined,
  decimals = 0,
): string {
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  const absNum = Math.abs(num);
  const dollars =
    '$' +
    absNum.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  if (num > 0) return '+' + dollars;
  if (num < 0) return '-' + dollars;
  return dollars;
}

export function formatSignedNumberValue(
  value: number | null | undefined,
  decimals = 0,
): string {
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  const absStr = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (num > 0) return '+' + absStr;
  if (num < 0) return '-' + absStr;
  return absStr;
}

export function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const mon = months[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  const yr = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${mon} ${day} ${yr} ${hh}.${mm}.${ss}`;
}

export function humanizeLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/Mw\b/g, 'MW')
    .replace(/Mwh\b/g, 'MWh')
    .replace(/Pv\b/g, 'PV')
    .replace(/Afudc\b/g, 'AFUDC')
    .replace(/Bcr\b/g, 'BCR')
    .replace(/Co2\b/g, 'CO2')
    .replace(/Sox\b/g, 'SOx')
    .replace(/Nox\b/g, 'NOx')
    .replace(/Eal\b/g, 'EAL')
    .replace(/Eac\b/g, 'EAC');
}
