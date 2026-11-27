// graao AI Gateway: classificação de dados e política de privacidade por provedor.
// Cada funcionalidade declara a classe do contexto que envia; o roteador só usa provedores cuja política,
// confirmada pelo administrador, aceita essa classe. Sem confirmação, o provedor só recebe dado público/interno.

export const DATA_CLASSES = Object.freeze(['public', 'internal', 'confidential', 'personal', 'sensitive', 'restricted']);
export const DATA_CLASS_LABELS = Object.freeze({
  public: 'Público', internal: 'Interno', confidential: 'Confidencial', personal: 'Pessoal', sensitive: 'Pessoal sensível', restricted: 'Restrito'
});

export const rankOf = dataClass => {
  const index = DATA_CLASSES.indexOf(dataClass);
  return index < 0 ? DATA_CLASSES.length - 1 : index; // classe desconhecida vale como a mais restrita
};

/**
 * Política padrão de um provedor ainda não revisado: retenção e uso para treino desconhecidos,
 * então só dado público ou interno. API gratuita nunca é presumida adequada para dado pessoal.
 */
export const defaultPrivacy = () => ({ reviewed: false, trainsOnData: 'unknown', retention: 'unknown', region: 'unknown', dpa: false, maxClass: 'internal' });

export function sanitizePrivacy(input = {}, current = defaultPrivacy()) {
  const pick = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  const next = {
    reviewed: input.reviewed === undefined ? current.reviewed : Boolean(input.reviewed),
    trainsOnData: pick(input.trainsOnData, ['unknown', 'yes', 'no'], current.trainsOnData),
    retention: pick(input.retention, ['unknown', 'none', 'short', 'long'], current.retention),
    region: String(input.region ?? current.region ?? 'unknown').slice(0, 40),
    dpa: input.dpa === undefined ? current.dpa : Boolean(input.dpa),
    maxClass: pick(input.maxClass, DATA_CLASSES, current.maxClass)
  };
  // Travas que o painel não desliga: quem treina com os dados nunca recebe dado pessoal; sem revisão, no máximo interno;
  // 'restricted' exige contrato de tratamento (DPA) e retenção zero.
  if (next.trainsOnData !== 'no' && rankOf(next.maxClass) > rankOf('internal')) next.maxClass = 'internal';
  if (!next.reviewed && rankOf(next.maxClass) > rankOf('internal')) next.maxClass = 'internal';
  if (next.maxClass === 'restricted' && !(next.dpa && next.retention === 'none')) next.maxClass = 'sensitive';
  return next;
}

/** A política do provedor aceita esta classe de dado? */
export function privacyAllows(privacy, dataClass) {
  const policy = privacy || defaultPrivacy();
  return rankOf(dataClass) <= rankOf(policy.maxClass);
}

// Redação para logs: e-mail, telefone, CPF/CNPJ, cartões e chaves de API somem antes de qualquer gravação.
const PATTERNS = [
  [/\b(sk|rk|pk|gsk|xai|csk|fw)[-_][A-Za-z0-9_-]{8,}\b/g, '[chave]'],
  [/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[chave]'],
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [chave]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj]'],
  [/\b(?:\d[ -]?){13,19}\b/g, '[numero]'],
  [/\+?\b\d{2}\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[telefone]']
];
export function redact(text, limit = 300) {
  let value = String(text ?? '');
  for (const [pattern, replacement] of PATTERNS) value = value.replace(pattern, /** @type {any} */ (replacement));
  return value.slice(0, limit);
}
