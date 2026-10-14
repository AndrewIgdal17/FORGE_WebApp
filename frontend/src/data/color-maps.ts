export const SUBREGION_COLORS: Record<string, string> = {
  AKGD: '#8dd3c7', AKMS: '#ffffb3', AZNM: '#bebada',
  CAMX: '#fb8072', ERCT: '#80b1d3', FRCC: '#fdb462',
  HIMS: '#fb8072', HIOA: '#80b1d3', MROE: '#fdb462',
  MROW: '#b3de69', NEWE: '#fccde5', NWPP: '#d9d9d9',
  NYCW: '#ffed6f', NYLI: '#bc80bd', NYUP: '#ccebc5',
  PRMS: '#ffed6f', RFCE: '#d9d9d9', RFCM: '#8dd3c7',
  RFCW: '#bebada', RMPA: '#ccebc5', SPNO: '#fccde5',
  SPSO: '#bc80bd', SRMV: '#b3de69', SRMW: '#fdb462',
  SRSO: '#ffffb3', SRTV: '#fb8072', SRVC: '#80b1d3',
};

export const SUBREGION_FILL_EXPRESSION: unknown[] = [
  'match', ['get', 'subregion'],
  ...Object.entries(SUBREGION_COLORS).flat(),
  '#d9d9d9', // fallback
];

export const VOLTAGE_STYLES: readonly { voltClass: string; color: string; width: number; label: string }[] = [
  { voltClass: '735 AND ABOVE', color: '#dc2626', width: 3, label: '735+ kV' },
  { voltClass: 'DC', color: '#9333ea', width: 3, label: 'DC' },
  { voltClass: '500', color: '#ea580c', width: 2.5, label: '500 kV' },
  { voltClass: '345', color: '#d97706', width: 2, label: '345 kV' },
  { voltClass: '220-287', color: '#ca8a04', width: 1.5, label: '220–287 kV' },
  { voltClass: '100-161', color: '#65a30d', width: 1, label: '100–161 kV' },
  { voltClass: 'SUB 100', color: '#94a3b8', width: 0.5, label: 'Sub 100 kV' },
  { voltClass: 'UNDER 100', color: '#94a3b8', width: 0.5, label: 'Under 100 kV' },
  { voltClass: 'NOT AVAILABLE', color: '#cbd5e1', width: 0.5, label: 'Unknown' },
];

export const VOLTAGE_COLOR_EXPRESSION: unknown[] = [
  'match', ['get', 'volt_class'],
  ...VOLTAGE_STYLES.flatMap(v => [v.voltClass, v.color]),
  '#cbd5e1',
];

export const VOLTAGE_WIDTH_EXPRESSION: unknown[] = [
  'match', ['get', 'volt_class'],
  ...VOLTAGE_STYLES.flatMap(v => [v.voltClass, v.width]),
  0.5,
];

export const STATEFP_TO_ABBR: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '78': 'VI',
};
