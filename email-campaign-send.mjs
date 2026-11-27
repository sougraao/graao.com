// Campaign delivery: renders each leased recipient with its own tracking links and sends them through
// Resend's batch endpoint (up to 100 per call), from the sub-account's verified domain when it has one.
import { fillText, mergeValues, renderEmail } from './ui/email-blocks.js';

const name = value => String(value || '').replace(/[<>"\r\n]/g, '').trim();
const originOf = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.origin : ''; } catch { return ''; } };

/** The public links of one recipient (open pixel, click redirect, unsubscribe). */
export const trackingUrls = (origin, workspace, token) => ({
  pixel: `${origin}/e/o/${workspace}/${token}`,
  click: index => `${origin}/e/c/${workspace}/${token}/${index}`,
  unsubscribe: `${origin}/e/u/${workspace}/${token}`
});

/** One Resend message for one leased recipient (see emailTake in email-campaign-model.mjs). */
export function campaignMessage({ workspace, item, campaign, business, from, publicOrigin = '' }) {
  const origin = originOf(campaign.origin) || originOf(publicOrigin);
  const urls = origin ? trackingUrls(origin, workspace, item.token) : null;
  const values = mergeValues(item.contact, { name: business });
  const variant = campaign[item.variant === 'B' ? 'B' : 'A'];
  // Countdown GIFs carry the send time, so an evergreen timer counts from when this e-mail went out.
  const sentAt = Math.floor(Date.now() / 1000);
  const { html, text } = renderEmail({ blocks: campaign.blocks, style: campaign.style, preheader: fillText(variant.preheader, values), business, values,
    link: (url, index) => urls ? urls.click(index) : url, pixel: urls?.pixel || '', unsubscribe: urls?.unsubscribe || '',
    countdownSrc: origin ? id => `${origin}/cd/${workspace}/${id}.gif?s=${sentAt}` : null });
  return {
    from: `${name(campaign.fromName) || name(business) || 'Graao'} <${from}>`, to: [item.email], subject: fillText(variant.subject, values).slice(0, 250) || '(sem assunto)', html, text,
    ...(campaign.replyTo ? { reply_to: campaign.replyTo } : {}),
    ...(urls ? { headers: { 'List-Unsubscribe': `<${urls.unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {})
  };
}

export function campaignMailer({ key = process.env.RESEND_API_KEY, from = process.env.PORTAL_EMAIL_FROM, publicOrigin = process.env.PORTAL_PUBLIC_ORIGIN || process.env.SOCIAL_PUBLIC_URL, request = fetch } = {}) {
  const platform = /<([^>]+)>/.exec(from || '')?.[1] || from || '';
  const post = (messages, idempotency) => request('https://api.resend.com/emails/batch', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotency },
    body: JSON.stringify(messages)
  }).catch(() => null);
  return {
    configured: Boolean(key && from),
    platform,
    publicOrigin,
    /**
     * Sends one leased batch. Returns per-item results for email-result, or null when the batch should be
     * retried later (rate limit or no answer): the items stay leased and come back after the lease expires.
     */
    async sendBatch({ workspace, items, campaigns, business, fromAddress = '' }) {
      if (!items.length) return [];
      if (!key || !from) return items.map(item => ({ campaignId: item.campaignId, token: item.token, ok: false, error: 'e-mail não configurado (RESEND_API_KEY e PORTAL_EMAIL_FROM)' }));
      const build = sender => items.map(item => campaignMessage({ workspace, item, campaign: campaigns[item.campaignId], business, from: sender, publicOrigin }));
      const idem = `camp-${workspace}-${items[0].token}-${items.length}`;
      let response = await post(build(fromAddress || platform), idem);
      // 403: the sub-account's domain stopped being verified; send from the platform address instead.
      if (fromAddress && response?.status === 403) response = await post(build(platform), `${idem}-platform`);
      if (!response || response.status === 429 || response.status >= 500) return null;
      if (response.ok) return items.map(item => ({ campaignId: item.campaignId, token: item.token, ok: true }));
      const detail = String((await response.json().catch(() => ({})))?.message || '').slice(0, 160);
      return items.map(item => ({ campaignId: item.campaignId, token: item.token, ok: false, error: `recusado pelo serviço de e-mail (HTTP ${response.status})${detail ? `: ${detail}` : ''}` }));
    },
    /** A single test e-mail to the user's own address (no tracking, links point straight to their targets). */
    async sendTest({ to, subject, html, text, fromName, replyTo, fromAddress = '' }) {
      if (!key || !from) throw Object.assign(new Error('O envio de e-mail não está configurado nesta instalação (RESEND_API_KEY e PORTAL_EMAIL_FROM).'), { status: 503 });
      const message = sender => ({ from: `${name(fromName) || 'Graao'} <${sender}>`, to: [to], subject: `[Teste] ${subject}`.slice(0, 250), html, text, ...(replyTo ? { reply_to: replyTo } : {}) });
      let response = await post([message(fromAddress || platform)], `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      if (fromAddress && response?.status === 403) response = await post([message(platform)], `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      if (!response?.ok) throw Object.assign(new Error(`O serviço de e-mail não confirmou o envio${response ? ` (HTTP ${response.status})` : ''}.`), { status: 502 });
    }
  };
}
