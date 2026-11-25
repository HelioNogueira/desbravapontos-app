// Gerador oficial de BR Code (Pix Copia e Cola - padrão EMV Banco Central do Brasil)

function tlv(id, value) {
  const str = String(value || '');
  const len = String(str.length).padStart(2, '0');
  return `${id}${len}${str}`;
}

function crc16Ccitt(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function normalizePixPhoneKey(rawKey) {
  const digits = String(rawKey || '').replace(/\D/g, '');
  if (!digits) return '+5592994020715';
  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`;
  }
  return `+55${digits}`;
}

function sanitizeAscii(str, maxLen) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, maxLen);
}

export function generatePixPayload({
  key = '92994020715',
  amount = 39.9,
  merchantName = 'DESBRAVAPONTOS',
  city = 'MANAUS',
  txid = 'MENSALIDADE'
}) {
  const pixKey = String(key).includes('@') || String(key).includes('-')
    ? String(key).trim()
    : normalizePixPhoneKey(key);

  const gui = tlv('00', 'br.gov.bcb.pix');
  const keyField = tlv('01', pixKey);
  const merchantAccount = tlv('26', `${gui}${keyField}`);

  const cleanName = sanitizeAscii(merchantName, 25) || 'DESBRAVAPONTOS';
  const cleanCity = sanitizeAscii(city, 15) || 'MANAUS';
  const cleanTxid = String(txid || 'MENSALIDADE')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 25) || 'MENSALIDADE';

  const formattedAmount = Number(amount) > 0 ? Number(amount).toFixed(2) : '';

  let payload =
    tlv('00', '01') +
    merchantAccount +
    tlv('52', '0000') +
    tlv('53', '986');

  if (formattedAmount) {
    payload += tlv('54', formattedAmount);
  }

  payload +=
    tlv('58', 'BR') +
    tlv('59', cleanName) +
    tlv('60', cleanCity) +
    tlv('62', tlv('05', cleanTxid)) +
    '6304';

  return payload + crc16Ccitt(payload);
}
