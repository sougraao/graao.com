// Regras puras do celular confirmado: normalizar o número, gerar o código
// que a pessoa manda pelo WhatsApp e montar o link pronto.
import { createHash, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function brazilMobile(local) {
  // local = DDD + número (sem o 55)
  const ddd = local.slice(0, 2);
  let rest = local.slice(2);
  if (!/^[1-9][1-9]$/.test(ddd)) return '';
  if (rest.length === 8) {
    if (!/^[6-9]/.test(rest)) return '';
    rest = `9${rest}`;
  }
  if (rest.length !== 9 || rest[0] !== '9') return '';
  return `55${ddd}${rest}`;
}

export function normalizePhone(raw) {
  const text = String(raw ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (!digits) return '';
  const international = text.startsWith('+') || text.startsWith('00');
  const number = text.startsWith('00') ? digits.slice(2) : digits;
  if (number.startsWith('55') && (number.length === 12 || number.length === 13)) return brazilMobile(number.slice(2));
  if (!international && (number.length === 10 || number.length === 11)) return brazilMobile(number);
  if (number.startsWith('55')) return '';
  return number.length >= 10 && number.length <= 15 ? number : '';
}

export function phoneKey(e164) {
  return `phone-${createHash('sha256').update(String(e164)).digest('hex')}`;
}

export function hashCode(code) {
  return createHash('sha256').update(`graao-verify:${String(code).toUpperCase()}`).digest('hex');
}

export function newCode(random) {
  const pick = random ? () => Math.floor(random() * ALPHABET.length) % ALPHABET.length : () => randomInt(ALPHABET.length);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[pick()];
  return { code, hash: hashCode(code) };
}

export function codeFromText(text) {
  const match = /confirmar\s+graao\s+([a-z0-9]{6})\b/i.exec(String(text ?? ''));
  return match ? match[1].toUpperCase() : '';
}

export function verifyLink(number, code) {
  return `https://wa.me/${number}?text=${encodeURIComponent(`Confirmar graao ${code}`)}`;
}
