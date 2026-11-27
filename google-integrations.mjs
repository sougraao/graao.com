// Google integrations for the sub-account dashboard: Google Analytics (GA4), Google Business Profile and,
// for Reputação → SEO, Google Search Console (positions, clicks and impressions of the site's searches).
// One OAuth consent per workspace reads both products. Tokens are sealed with the Social Planner key and
// never reach the browser; only account labels, the chosen property/location and report numbers do.
const env = name => process.env[name] || '';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const form = data => new URLSearchParams(Object.entries(data).filter(([, v]) => v !== undefined && v !== ''));

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/business.manage', 'https://www.googleapis.com/auth/webmasters.readonly'];

let fetcher = (...args) => fetch(...args);
export const useGoogleFetch = f => { fetcher = f; };

async function call(url, { method = 'GET', token, json, body } = {}) {
  const res = await fetcher(url, { method, body: json ? JSON.stringify(json) : body, signal: AbortSignal.timeout(30_000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) } });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 300) }; }
  if (!res.ok) {
    const reason = data.error?.status || data.error?.errors?.[0]?.reason || '';
    const message = data.error?.message || data.error_description || data.message || `HTTP ${res.status}`;
    throw Object.assign(new Error(String(message).slice(0, 400)), { status: res.status === 401 ? 401 : 502, reason });
  }
  return data;
}

export const googleConfigured = () => Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'));

export function googleAuthUrl({ redirectUri, state }) {
  if (!googleConfigured()) fail('A integração com o Google ainda não foi configurada nesta instalação.', 409);
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + form({ client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: redirectUri, response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
}

const tokenSecret = t => ({ token: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000 });

export async function freshSecret(secret) {
  if (secret?.token && secret.expiresAt > Date.now() + 60_000) return { secret, changed: false };
  if (!secret?.refresh) fail('O acesso ao Google expirou. Conecte a conta de novo.', 401);
  const t = await call('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'),
    refresh_token: secret.refresh, grant_type: 'refresh_token' }) });
  return { secret: { ...secret, token: t.access_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000 }, changed: true };
}

export async function listProperties(token) {
  const out = [];
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const data = await call('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?' + form({ pageSize: '200', pageToken }), { token });
    for (const account of data.accountSummaries || []) {
      for (const property of account.propertySummaries || []) {
        out.push({ id: property.property, name: property.displayName || property.property, account: account.displayName || '' });
      }
    }
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return out.slice(0, 500);
}

export async function listLocations(token) {
  const out = [];
  const accounts = await call('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20', { token });
  for (const account of (accounts.accounts || []).slice(0, 20)) {
    const data = await call(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?` + form({ readMask: 'name,title,storefrontAddress', pageSize: '100' }), { token });
    for (const location of data.locations || []) {
      const address = location.storefrontAddress;
      out.push({ id: location.name, name: location.title || location.name, account: account.accountName || '', accountId: account.name || '',
        address: [address?.addressLines?.[0], address?.locality].filter(Boolean).join(', ') });
    }
  }
  return out.slice(0, 500);
}

const friendly = (error, product) => {
  if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(`${error.reason} ${error.message}`)) return `A API do ${product} ainda não está liberada para este app no Google Cloud.`;
  if (error.status === 401) return 'O acesso ao Google expirou. Conecte a conta de novo.';
  if (/quota|RESOURCE_EXHAUSTED|rate/i.test(`${error.reason} ${error.message}`)) return `O Google limitou o acesso ao ${product}. Tente de novo em alguns minutos.`;
  if (/PERMISSION_DENIED|insufficient/i.test(`${error.reason} ${error.message}`)) return `Esta conta Google não deu permissão para o ${product}.`;
  return `Não foi possível ler o ${product}: ${error.message}`;
};

export async function exchangeGoogle({ code, redirectUri }) {
  if (!code) fail('O Google não devolveu a autorização.', 400);
  const t = await call('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ code, client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  const granted = String(t.scope || '').split(' ');
  const secret = tokenSecret(t);
  const user = await call('https://openidconnect.googleapis.com/v1/userinfo', { token: secret.token }).catch(() => ({}));
  const result = { secret, email: String(user.email || '').slice(0, 240), properties: [], locations: [], errors: {} };
  if (granted.includes(GOOGLE_SCOPES[2])) {
    try { result.properties = await listProperties(secret.token); } catch (e) { result.errors.analytics = friendly(e, 'Google Analytics'); }
  } else result.errors.analytics = 'A permissão de leitura do Google Analytics não foi concedida.';
  if (granted.includes(GOOGLE_SCOPES[3])) {
    try { result.locations = await listLocations(secret.token); } catch (e) { result.errors.business = friendly(e, 'Perfil da Empresa'); }
  } else result.errors.business = 'A permissão do Perfil da Empresa não foi concedida.';
  result.sites = [];
  if (granted.includes(GOOGLE_SCOPES[4])) {
    try { result.sites = await listSites(secret.token); } catch (e) { result.errors.search = friendly(e, 'Search Console'); }
  } else result.errors.search = 'A permissão do Search Console não foi concedida.';
  return result;
}

const iso = day => day.toISOString().slice(0, 10);

/* ───────── Search Console (Reputação → SEO) ───────── */

export const validSite = value => /^(https?:\/\/[^\s/]+\.[^\s]*\/|sc-domain:[a-z0-9.-]+\.[a-z]{2,})$/i.test(value || '');
export async function listSites(token) {
  const data = await call('https://www.googleapis.com/webmasters/v3/sites', { token });
  return (data.siteEntry || []).filter(row => row.permissionLevel !== 'siteUnverifiedUser' && validSite(row.siteUrl))
    .map(row => ({ id: row.siteUrl, name: row.siteUrl.startsWith('sc-domain:') ? `${row.siteUrl.slice(10)} (domínio)` : row.siteUrl }))
    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200);
}
const one = value => Math.round(value * 10) / 10;
const keywordKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
/** The last 28 days with data (Search Console lags ~3 days) against the 28 before: totals by day, the tracked keywords and the "almost there" searches. */
export async function searchReport(token, site, keywords = [], now = new Date()) {
  if (!validSite(site)) fail('Site do Search Console inválido. Escolha o site de novo em Configurações → Google.');
  const day = 86_400_000;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
  const start = new Date(end.getTime() - 27 * day), prevEnd = new Date(start.getTime() - day), prevStart = new Date(prevEnd.getTime() - 27 * day);
  const query = (from, to, dimensions, rowLimit) => call(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    { method: 'POST', token, json: { startDate: iso(from), endDate: iso(to), dimensions, rowLimit, dataState: 'final' } }).then(data => data.rows || []);
  const [current, previous, daily] = await Promise.all([query(start, end, ['query'], 5000), query(prevStart, prevEnd, ['query'], 5000), query(start, end, ['date'], 40)]);
  const row = item => ({ keyword: item.keys[0], clicks: item.clicks || 0, impressions: item.impressions || 0, ctr: one((item.ctr || 0) * 100), position: one(item.position || 0) });
  const now28 = new Map(current.map(item => [keywordKey(item.keys[0]), row(item)]));
  const before = new Map(previous.map(item => [keywordKey(item.keys[0]), one(item.position || 0)]));
  const tracked = keywords.map(keywordKey).filter(Boolean).map(keyword => {
    const hit = now28.get(keyword), prior = before.get(keyword) ?? null;
    return { keyword, clicks: hit?.clicks || 0, impressions: hit?.impressions || 0, ctr: hit?.ctr || 0, position: hit?.position ?? null, previous: prior,
      change: hit && prior !== null ? one(prior - hit.position) : null };
  });
  const rows = [...now28.values()];
  const clicks = daily.reduce((sum, item) => sum + (item.clicks || 0), 0), impressions = daily.reduce((sum, item) => sum + (item.impressions || 0), 0);
  return {
    range: { start: iso(start), end: iso(end) },
    totals: { clicks, impressions, ctr: impressions ? one(clicks / impressions * 100) : 0, position: impressions ? one(daily.reduce((sum, item) => sum + (item.position || 0) * (item.impressions || 0), 0) / impressions) : null },
    days: daily.map(item => ({ day: item.keys[0], clicks: item.clicks || 0, impressions: item.impressions || 0 })).sort((a, b) => a.day.localeCompare(b.day)),
    keywords: tracked,
    top: [...rows].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 20),
    opportunities: rows.filter(item => item.position >= 4 && item.position <= 20).sort((a, b) => b.impressions - a.impressions).slice(0, 10)
  };
}
export const searchError = error => Object.assign(new Error(friendly(error, 'Search Console')), { status: error.status === 401 ? 401 : 502 });
const dateParts = day => ({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() });

export async function analyticsReport(token, property, now = new Date()) {
  if (!/^properties\/\d{1,20}$/.test(property)) fail('Propriedade do Google Analytics inválida.');
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const data = await call(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, { method: 'POST', token, json: {
    dateRanges: [{ startDate: iso(start), endDate: 'today' }], dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }], orderBys: [{ dimension: { dimensionName: 'yearMonth' } }], limit: 24 } });
  const byMonth = new Map((data.rows || []).map(row => [row.dimensionValues[0].value, row.metricValues.map(item => Number(item.value) || 0)]));
  const months = Array.from({ length: 12 }, (_, index) => {
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    const key = `${day.getUTCFullYear()}${String(day.getUTCMonth() + 1).padStart(2, '0')}`;
    const [sessions = 0, users = 0, views = 0] = byMonth.get(key) || [];
    return { month: `${key.slice(0, 4)}-${key.slice(4)}`, sessions, users, views };
  });
  const sum = key => months.reduce((total, row) => total + row[key], 0);
  return { months, totals: { sessions: sum('sessions'), users: sum('users'), views: sum('views') } };
}

const businessMetrics = ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 'CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS'];

export async function businessReport(token, location, now = new Date()) {
  if (!/^locations\/\d{1,30}$/.test(location)) fail('Local do Perfil da Empresa inválido.');
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end.getTime() - 29 * 86_400_000);
  const params = new URLSearchParams();
  for (const metric of businessMetrics) params.append('dailyMetrics', metric);
  for (const [prefix, day] of [['dailyRange.startDate', start], ['dailyRange.endDate', end]]) {
    for (const [key, value] of Object.entries(dateParts(day))) params.set(`${prefix}.${key}`, String(value));
  }
  const data = await call(`https://businessprofileperformance.googleapis.com/v1/${location}:fetchMultiDailyMetricsTimeSeries?${params}`, { token });
  const daily = new Map();
  const totals = { views: 0, calls: 0, website: 0, directions: 0 };
  for (const group of data.multiDailyMetricTimeSeries || []) {
    for (const series of group.dailyMetricTimeSeries || []) {
      const metric = series.dailyMetric;
      for (const point of series.timeSeries?.datedValues || []) {
        const value = Number(point.value) || 0;
        const key = `${point.date.year}-${String(point.date.month).padStart(2, '0')}-${String(point.date.day).padStart(2, '0')}`;
        if (metric.startsWith('BUSINESS_IMPRESSIONS')) { totals.views += value; daily.set(key, (daily.get(key) || 0) + value); }
        else if (metric === 'CALL_CLICKS') totals.calls += value;
        else if (metric === 'WEBSITE_CLICKS') totals.website += value;
        else if (metric === 'BUSINESS_DIRECTION_REQUESTS') totals.directions += value;
      }
    }
  }
  const days = Array.from({ length: 30 }, (_, index) => {
    const key = iso(new Date(start.getTime() + index * 86_400_000));
    return { day: key, views: daily.get(key) || 0 };
  });
  return { totals, days };
}

export async function googleReports(secret, { gaProperty, gbpLocation }) {
  const fresh = await freshSecret(secret);
  const token = fresh.secret.token;
  const [ga, gbp] = await Promise.all([
    gaProperty ? analyticsReport(token, gaProperty).catch(e => ({ error: friendly(e, 'Google Analytics') })) : null,
    gbpLocation ? businessReport(token, gbpLocation).catch(e => ({ error: friendly(e, 'Perfil da Empresa') })) : null
  ]);
  return { ga, gbp, secret: fresh.changed ? fresh.secret : null };
}

export async function revokeGoogle(secret) {
  const token = secret?.refresh || secret?.token;
  if (token) await fetcher('https://oauth2.googleapis.com/revoke?' + form({ token }), { method: 'POST', signal: AbortSignal.timeout(10_000) }).catch(() => null);
}

/* ───────── Business Profile: profile, reviews and replies (Reputação → Perfil no Google) ───────── */

export const googleError = error => Object.assign(new Error(friendly(error, 'Perfil da Empresa')), { status: error.status === 401 ? 401 : 502 });
const locationId = value => (/^locations\/\d{1,30}$/.test(value || '') ? value : fail('Local do Perfil da Empresa inválido.'));
const accountId = value => (/^accounts\/\d{1,30}$/.test(value || '') ? value : fail('Conta do Perfil da Empresa inválida. Escolha o local de novo em Configurações → Google.'));
const detailMask = 'name,title,phoneNumbers,categories,storefrontAddress,websiteUri,regularHours,specialHours,serviceArea,profile,openInfo,metadata,serviceItems';

export async function locationDetails(token, location) {
  return call(`https://mybusinessbusinessinformation.googleapis.com/v1/${locationId(location)}?` + form({ readMask: detailMask }), { token });
}

// Only the fields the team edits in graao; Google rejects unknown or empty masks.
export async function updateLocation(token, location, patch) {
  const fields = Object.keys(patch);
  if (!fields.length) fail('Nada para atualizar.');
  const mask = fields.map(field => ({ description: 'profile.description', phone: 'phoneNumbers.primaryPhone', website: 'websiteUri', hours: 'regularHours' })[field] || fail('Campo inválido.')).join(',');
  const body = {};
  if ('description' in patch) body.profile = { description: patch.description };
  if ('phone' in patch) body.phoneNumbers = { primaryPhone: patch.phone };
  if ('website' in patch) body.websiteUri = patch.website;
  if ('hours' in patch) body.regularHours = { periods: patch.hours };
  return call(`https://mybusinessbusinessinformation.googleapis.com/v1/${locationId(location)}?` + form({ updateMask: mask }), { method: 'PATCH', token, json: body });
}

const starScore = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export async function listGoogleReviews(token, account, location) {
  const out = [];
  let pageToken = '';
  for (let page = 0; page < 4; page++) {
    const data = await call(`https://mybusiness.googleapis.com/v4/${accountId(account)}/${locationId(location)}/reviews?` + form({ pageSize: '50', pageToken }), { token });
    for (const review of data.reviews || []) {
      out.push({ googleName: review.name, author: review.reviewer?.isAnonymous ? 'Cliente do Google' : review.reviewer?.displayName || 'Cliente do Google',
        score: starScore[review.starRating] || 0, text: String(review.comment || '').replace(/\(Translated by Google\)[\s\S]*$/, '').trim(),
        reply: review.reviewReply?.comment || '', created: review.createTime || '', updated: review.updateTime || '' });
    }
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return out.filter(review => review.score);
}

export async function replyGoogleReview(token, reviewName, comment) {
  if (!/^accounts\/\d{1,30}\/locations\/\d{1,30}\/reviews\/[\w-]{1,200}$/.test(reviewName || '')) fail('Avaliação do Google inválida.');
  const text = String(comment || '').trim();
  if (!text) return call(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, { method: 'DELETE', token });
  return call(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, { method: 'PUT', token, json: { comment: text.slice(0, 4000) } });
}
