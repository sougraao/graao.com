// Documentos e contratos: the messages behind each personal signing link. The model queues them in the
// workspace outbox; the server delivers by e-mail (Resend) and, when chosen, by WhatsApp, and records
// the outcome in the document's audit trail.

/** The platform address with a display name of the sub-account ("Studio <no-reply@…>"): the address itself needs a verified domain. */
const senderOf = (from, name) => { const clean = String(name || '').replace(/[<>"\r\n]/g, '').trim(); const address = /<([^>]+)>/.exec(from)?.[1] || from; return clean ? `${clean} <${address}>` : from; };
const httpsOrigin = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.origin : ''; } catch { return ''; } };

/** Plain-text bodies (no HTML: nothing from the document is interpreted by the mail client). */
export function documentMessage(item, link) {
  const sender = item.sender || 'Graao';
  if (item.what === 'giftcard') {
    const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value || 0);
    const until = /^\d{4}-\d{2}-\d{2}$/.test(item.expiresAt || '') ? ` Válido até ${item.expiresAt.split('-').reverse().join('/')}.` : '';
    return { subject: `${sender} enviou um cartão-presente de ${value}`,
      text: `Olá${item.name ? `, ${item.name}` : ''}.

Você recebeu um cartão-presente de ${value} de ${sender}.${item.message ? `

“${item.message}”` : ''}

Código: ${item.code}

Use o código no carrinho da loja, no campo “Cartão-presente”.${until}` };
  }
  if (item.what === 'cart') return { subject: item.subject, text: `${item.message}\n\nSeu carrinho está guardado neste link:\n${link}` };
  if (item.what === 'receipt') return { subject: item.subject, text: `${item.message}\n\nVeja o recibo e a fatura:\n${link}` };
  if (item.what === 'invoice') {
    const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value || 0);
    const due = /^\d{4}-\d{2}-\d{2}/.test(item.due || '') ? item.due.slice(0, 10).split('-').reverse().join('/') : '';
    return { subject: `${sender} enviou a fatura ${item.title}`,
      text: `Olá, ${item.name}.\n\n${sender} enviou a fatura ${item.title}, de ${brl}${due ? `, com vencimento em ${due}` : ''}.\n\nVeja os itens e pague por Pix ou cartão pelo link:\n${link}\n\nO link é pessoal: não encaminhe.` };
  }
  if (item.what === 'estimate') {
    if (item.kind === 'document-owner') {
      const what = item.event === 'accepted' ? 'foi aceito' : 'foi recusado';
      return { subject: `Orçamento ${item.title} ${what}`, text: `O orçamento ${item.title} ${what}.\n\nAbra Pagamentos → Orçamentos no Graao para ver os detalhes.` };
    }
    return { subject: item.subject || `${sender} enviou o orçamento ${item.title}`,
      text: `Olá, ${item.name}.\n\n${sender} enviou o orçamento ${item.title} para você.${item.message ? `\n\n${item.message}` : ''}\n\nVeja, escolha os itens opcionais e aprove ou recuse pelo link:\n${link}` };
  }
  if (item.kind === 'document-owner') {
    const what = item.event === 'completed' ? 'foi assinado por todos' : 'foi recusado';
    return { subject: `“${item.title}” ${what}`, text: `O documento “${item.title}” ${what}.\n\nAbra Pagamentos → Documentos e contratos no Graao para ver os detalhes e a trilha de auditoria.` };
  }
  if (item.final) {
    return { subject: `Cópia final: ${item.title}`, text: `Olá, ${item.name}.\n\nO documento “${item.title}”, enviado por ${sender}, foi assinado por todos.${item.pays ? ' Falta o pagamento: pelo mesmo link você paga por Pix ou cartão.' : ''}\n\nAbra a cópia final com o certificado de conclusão:\n${link}\n\nGuarde este e-mail: o link é pessoal.` };
  }
  const verb = item.role === 'approver' ? 'aprovar' : 'assinar';
  return {
    subject: item.subject || `${sender} enviou “${item.title}” para você ${verb}`,
    text: `Olá, ${item.name}.\n\n${sender} enviou o documento “${item.title}” para você ${verb}.${item.message ? `\n\n${item.message}` : ''}\n\nAbra pelo link pessoal:\n${link}\n\nNão encaminhe este link: ele identifica você na assinatura.`
  };
}

export function documentMailer({ key = process.env.RESEND_API_KEY, from = process.env.PORTAL_EMAIL_FROM, publicOrigin = process.env.PORTAL_PUBLIC_ORIGIN || process.env.SOCIAL_PUBLIC_URL, request = fetch } = {}) {
  const fallback = httpsOrigin(publicOrigin);
  return {
    configured: Boolean(key && from),
    linkOf: item => item.path ? `${httpsOrigin(item.origin) || fallback}${item.path}` : '',
    /** `fromAddress` is the sub-account's verified domain (Serviços de e-mail); without it the platform address sends. */
    async email(to, { subject, text }, idempotency, { fromName = '', replyTo = '', fromAddress = '' } = {}) {
      if (!key || !from) return 'e-mail não configurado (RESEND_API_KEY e PORTAL_EMAIL_FROM)';
      const post = (sender, idem) => request('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
        body: JSON.stringify({ from: senderOf(sender, fromName), to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) })
      }).catch(() => null);
      let response = await post(fromAddress || from, idempotency);
      // Resend answers 403 when the domain stopped being verified (DNS records removed): fall back to the platform address.
      if (fromAddress && response?.status === 403) {
        response = await post(from, `${idempotency}-platform`);
        if (response?.ok) return `e-mail enviado pelo endereço da plataforma (o domínio ${fromAddress.split('@')[1]} não está verificado)`;
      }
      return response?.ok ? 'e-mail enviado' : `e-mail não enviado${response ? ` (HTTP ${response.status})` : ''}`;
    }
  };
}
