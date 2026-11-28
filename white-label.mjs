// White Label das subcontas: o domínio da agência (app.suaagencia.com.br) abre o graao com a marca dela.
// Três partes: o endereço salvo é validado e só pode ser de uma agência; o login, aberto nesse endereço,
// mostra o nome, o logotipo e a cor da agência; e, com um token da hospedagem (Vercel), o domínio é
// registrado no projeto sozinho, faltando à agência só o CNAME no DNS dela.
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

/** Para onde o CNAME do domínio da agência aponta. */
export const whiteLabelCname = 'cname.vercel-dns.com';
const platformHosts = ['graao.com', 'vercel.app', 'localhost'];

/** graao.com, its subdomains, the Vercel preview addresses and localhost: never an agency's address. */
export const isPlatformHost = host => !host || platformHosts.some(platform => host === platform || host.endsWith(`.${platform}`)) || /^(\d{1,3}\.){3}\d{1,3}$|^\[?::1\]?$/.test(host);

/** "app.agencia.com.br" from what the agency typed (scheme, path and port go away); '' clears it. */
export function whiteLabelHost(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  const host = raw.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (!/^(?=.{4,200}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) fail('Use um domínio como app.suaagencia.com.br.');
  if (platformHosts.some(platform => host === platform || host.endsWith(`.${platform}`))) fail('Use um domínio da sua agência, não um endereço da plataforma.');
  return host;
}

/** graao.com from app.graao.com, agencia.com.br from app.agencia.com.br, when the hosting did not say. */
const guessApex = host => {
  const labels = host.split('.');
  const second = labels.length > 2 && labels.at(-1).length === 2 && /^(com|net|org|gov|edu|co|ac|art|adv|eng|med|tur|ind|inf)$/.test(labels.at(-2));
  return labels.slice(second ? -3 : -2).join('.');
};

/** The host the request came in on, without the port. */
export const requestHost = req => String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');

/** The agency that owns this host ({ id, state }), or null on the platform's own addresses and unknown hosts. */
export async function whiteLabelAgency(store, host) {
  if (!host || platformHosts.some(platform => host === platform || host.endsWith(`.${platform}`))) return null;
  return (await store.findAgency({ company: { domain: host } })) || null;
}

/** Name, logo and color of the agency that owns this host, or {} on the platform's own addresses. */
export async function whiteLabelBrand(store, host) {
  const owner = await whiteLabelAgency(store, host);
  const company = owner?.state?.company;
  return company ? { name: company.name || '', logo: company.logo || '', primary: company.primary || '' } : {};
}

/** A domain another agency already uses cannot be saved. */
export async function requireFreeDomain(store, host, agencyId) {
  if (!host) return;
  const owner = await store.findAgency({ company: { domain: host } });
  if (owner && owner.id !== agencyId) fail('Este domínio já é usado por outra agência.', 409);
}

/**
 * The hosting side: adds the domain to the Vercel project and reads whether its DNS points here.
 * Without VERCEL_API_TOKEN and VERCEL_PROJECT_ID it is off, and the domain must be added by hand.
 */
export function hostingDomains({ token = process.env.VERCEL_API_TOKEN, project = process.env.VERCEL_PROJECT_ID, team = process.env.VERCEL_TEAM_ID, fetch: get = fetch } = {}) {
  const configured = Boolean(token && project);
  const call = async (path, init = {}) => {
    const url = new URL(`https://api.vercel.com${path}`);
    if (team) url.searchParams.set('teamId', team);
    const response = await get(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  return {
    configured,
    async add(host) {
      if (!configured || !host) return false;
      const result = await call(`/v10/projects/${encodeURIComponent(project)}/domains`, { method: 'POST', body: JSON.stringify({ name: host }) });
      // Already on this project counts as added.
      if (result.ok || (result.status === 409 && result.body?.error?.code === 'domain_already_in_use')) return true;
      fail(result.body?.error?.message || 'A hospedagem não aceitou o domínio.', 502);
    },
    /** Takes a domain the agency no longer uses off the project. Already gone counts as removed. */
    async remove(host) {
      if (!configured || !host) return false;
      const result = await call(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(host)}`, { method: 'DELETE' });
      if (result.ok || result.status === 404) return true;
      fail(result.body?.error?.message || 'A hospedagem não removeu o domínio antigo.', 502);
    },
    /**
     * Does this hosting really serve the host? Only reads: on the project, verified, and with the DNS pointing here.
     * The Google login code goes only to such a host (routes/auth.mjs); a domain saved by an agency is not enough.
     */
    async serves(host) {
      if (!configured || !host) return false;
      const [domain, config] = await Promise.all([
        call(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(host)}`),
        call(`/v6/domains/${encodeURIComponent(host)}/config`)
      ]);
      return domain.ok && domain.body?.verified === true && config.ok && config.body?.misconfigured === false;
    },
    async status(host) {
      if (!host) return { domain: '', cname: whiteLabelCname, hosting: configured, verification: [] };
      if (!configured) return { domain: host, cname: whiteLabelCname, hosting: false, verification: [] };
      const domainPath = `/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(host)}`;
      const [found, config] = await Promise.all([call(domainPath), call(`/v6/domains/${encodeURIComponent(host)}/config`)]);
      let domain = found;
      // A domain that is already in another Vercel account waits for a TXT ownership record. Each check asks
      // the hosting to look again, so the agency does not wait for Vercel's own retry after publishing it.
      if (domain.ok && !domain.body?.verified) {
        const check = await call(`${domainPath}/verify`, { method: 'POST' });
        if (check.ok) domain = check;
      }
      const verified = Boolean(domain.body?.verified);
      const verification = verified ? [] : (Array.isArray(domain.body?.verification) ? domain.body.verification : [])
        .map(row => ({ type: String(row.type || 'TXT'), name: String(row.domain || ''), value: String(row.value || '') }));
      const dns = config.ok ? config.body || {} : {};
      const best = list => [...(Array.isArray(list) ? list : [])].sort((a, b) => (a.rank || 0) - (b.rank || 0));
      const cname = String(best(dns.recommendedCNAME)[0]?.value || whiteLabelCname).replace(/\.$/, '');
      const vercelIps = best(dns.recommendedIPv4).flatMap(row => row.value || []);
      // Cloudflare with the orange cloud answers with its own IPs instead of the CNAME: the hosting cannot
      // issue the certificate behind it and the visitor sees error 525.
      const proxied = (dns.nameservers || []).some(ns => /cloudflare/i.test(ns)) && !(dns.cnames || []).length
        && (dns.aValues || []).length > 0 && !(dns.aValues || []).some(ip => vercelIps.includes(ip));
      // The records exactly as the DNS panel asks for them. Panels such as Squarespace, Registro.br and GoDaddy add
      // ".graao.com" to the name on their own, so the full name became graao.com.graao.com: the short one goes.
      // A domain without subdomain cannot hold a CNAME; the hosting asks for an A record there.
      const apex = String(found.body?.apexName || domain.body?.apexName || guessApex(host));
      const short = name => name === apex ? '@' : name.endsWith(`.${apex}`) ? name.slice(0, -apex.length - 1) : name;
      const address = host === apex
        ? { type: 'A', name: '@', value: String(best(dns.recommendedIPv4)[0]?.value?.[0] || '76.76.21.21') }
        : { type: 'CNAME', name: short(host), value: cname };
      const records = [address, ...verification.map(row => ({ ...row, name: short(row.name) }))];
      return { domain: host, apex, cname, hosting: true, added: domain.ok, verified, pointing: config.ok && dns.misconfigured === false, verification, records, proxied };
    }
  };
}

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
/** The logo as the agency saved it: an image kept in the document or one moved to the asset store. */
const safeLogo = value => typeof value === 'string' && (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(value) || /^\/asset\/[0-9a-f]{64}\.(png|jpg|webp|gif)$/.test(value)) ? value : '';

/**
 * login.html or app.html already in the agency's brand, so the page never shows graao first: name, logo, tab icon,
 * theme color, the line under the title and the footer. `data-marca` tells login.js not to brand it again.
 */
export function brandedPage(html, brand = {}) {
  const name = escapeHtml(String(brand.name || '').slice(0, 120)) || 'Entrar';
  const logo = safeLogo(brand.logo);
  const color = /^#[0-9a-f]{6}$/i.test(brand.primary || '') ? brand.primary : '';
  // The loading screen, the phone check and the tab title read the name and logo from <html> (ui/icons.js domainBrand).
  const mark = logo ? `<img class="boot-logo" src="${escapeHtml(logo)}" alt="">` : '';
  let page = html
    .replace('<html lang="pt-BR">', `<html lang="pt-BR" data-marca="agencia" data-marca-nome="${name}"${logo ? ` data-marca-logo="${escapeHtml(logo)}"` : ''}>`)
    .replace('<strong class="boot-title">Abrindo o graao…</strong>', `${mark}<strong class="boot-title">Abrindo ${name}…</strong>`)
    // As frases divertidas do carregamento são do graao; no domínio da agência fica só o nome dela.
    .replace(/<small class="boot-quip"[^>]*>[^<]*<\/small>/, '')
    .replace(/<title>Entrar · graao<\/title>/, `<title>Entrar · ${name}</title>`)
    .replace(/<title>graao<\/title>/, `<title>${name}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="Acesse ${name}.">`)
    .replace(/<div class="brand" aria-label="graao">[\s\S]*?<\/div>/, `<div class="brand" aria-label="${name}">${logo ? `<img class="brand-logo" src="${escapeHtml(logo)}" alt="${name}">` : name}</div>`)
    .replace('Acesse a plataforma graao com a sua conta Google.', `Acesse a plataforma ${name} com a sua conta Google.`)
    .replace(/© \d{4} graao\. Feito no Brasil com ☕, mordidas e muito MCP\./, `© ${new Date().getFullYear()} ${name}.`);
  if (logo) page = page.replace(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/, `<link rel="icon" href="${escapeHtml(logo)}">`);
  if (color) {
    page = page.replace(/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${color}">`)
      .replace('</head>', `<style>:root{--marca:${color}}body{background:radial-gradient(circle at 50% 0%,color-mix(in srgb,var(--marca) 16%,#f7f7f8) 0,#f7f7f8 37rem)}.google-button:focus-visible,.login-account:focus-visible{outline-color:color-mix(in srgb,var(--marca) 35%,transparent)}</style></head>`);
  }
  return page;
}
