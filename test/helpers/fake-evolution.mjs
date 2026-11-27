export const API_KEY = 'evo-global-key-super-secret';
export const QR = 'data:image/png;base64,' + Buffer.from('fake-evolution-qr').toString('base64');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Evolution API v2 falsa: só o que o graao usa.
export function fakeEvolution() {
  const calls = [];
  const media = new Map(); // id da mensagem -> { mimetype, base64 }, para /chat/getBase64FromMediaMessage
  const store = []; // mensagens guardadas no servidor, para /chat/findMessages
  const instances = new Map(); // name -> { state, ownerJid, profileName, webhook, pairing }
  async function request(url, init = {}) {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ path: u.pathname, search: u.search, method, headers, body });
    if (u.pathname === '/') return json({ status: 200, message: 'Welcome to the Evolution API, it is working!', version: '2.3.8' });
    if (headers.apikey !== API_KEY) return json({ status: 401, error: 'Unauthorized', response: { message: 'Unauthorized' } }, 401);

    if (u.pathname === '/instance/create' && method === 'POST') {
      if (instances.has(body.instanceName)) {
        return json({ status: 403, error: 'Forbidden', response: { message: [`This name "${body.instanceName}" is already in use.`] } }, 403);
      }
      instances.set(body.instanceName, { state: 'close', ownerJid: '', profileName: '', webhook: body.webhook || null, pairing: '' });
      return json({ instance: { instanceName: body.instanceName, status: 'created' }, hash: `hash-${body.instanceName}` }, 201);
    }
    const [, group, action, rawName] = u.pathname.split('/');
    const name = decodeURIComponent(rawName || '');
    if (u.pathname === '/instance/fetchInstances') {
      const wanted = u.searchParams.get('instanceName');
      if (!wanted) return json([...instances].map(([name, inst]) => ({ name, connectionStatus: inst.state })));
      const inst = instances.get(wanted);
      if (!inst) return json({ status: 404, error: 'Not Found', response: { message: ['Instance not found'] } }, 404);
      return json([{ name: wanted, connectionStatus: inst.state, ownerJid: inst.ownerJid || null, profileName: inst.profileName || null }]);
    }
    const inst = instances.get(name);
    if (!inst) return json({ status: 404, error: 'Not Found', response: { message: [`The "${name}" instance does not exist`] } }, 404);
    if (group === 'instance' && action === 'connect' && method === 'GET') {
      if (inst.state === 'open') return json({ instance: { instanceName: name, state: 'open' } });
      if (inst.state === 'connecting') return json({ pairingCode: inst.pairing || null, code: '2@abc', base64: QR, count: 1 });
      inst.state = 'connecting';
      inst.pairing = u.searchParams.get('number') ? 'WZYX-1234' : '';
      return json({ pairingCode: inst.pairing || null, code: '2@abc', base64: QR, count: 1 });
    }
    if (group === 'instance' && action === 'logout' && method === 'DELETE') {
      inst.state = 'close';
      inst.ownerJid = '';
      return json({ status: 'SUCCESS', error: false, response: { message: 'Instance logged out' } });
    }
    if (group === 'instance' && action === 'delete' && method === 'DELETE') {
      instances.delete(name);
      return json({ status: 'SUCCESS', error: false, response: { message: 'Instance deleted' } });
    }
    if (group === 'webhook' && action === 'find') return json(inst.webhook);
    if (group === 'chat' && action === 'findMessages' && method === 'POST') {
      const { gte, lte } = body.where.messageTimestamp, at = value => Math.floor(Date.parse(value) / 1000);
      const rows = store.filter(m => m.instance === name && m.messageTimestamp >= at(gte) && m.messageTimestamp <= at(lte)).sort((a, b) => b.messageTimestamp - a.messageTimestamp);
      return json({ messages: { total: rows.length, pages: Math.ceil(rows.length / body.offset), currentPage: body.page, records: rows.slice((body.page - 1) * body.offset, body.page * body.offset) } });
    }
    if (group === 'chat' && action === 'getBase64FromMediaMessage' && method === 'POST') {
      const file = media.get(body.message?.key?.id);
      if (file?.timeout) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      return file ? json({ mediaType: 'imageMessage', fileName: 'arquivo', ...file }, 201) : json({ status: 400, error: 'Bad Request', response: { message: ['Message not found'] } }, 400);
    }
    if (group === 'chat' && action === 'fetchBusinessProfile' && method === 'POST') return json({ isBusiness: false, number: body.number });
    if (group === 'instance' && action === 'restart' && method === 'POST') return json({ instance: { instanceName: name, state: 'open' } });
    if (group === 'webhook' && action === 'set' && method === 'POST') {
      inst.webhook = body.webhook;
      return json({ webhook: { instanceName: name, ...body.webhook } }, 201);
    }
    if (group === 'message' && action === 'sendText' && method === 'POST') {
      if (inst.state !== 'open') return json({ status: 400, error: 'Bad Request', response: { message: ['Connection Closed'] } }, 400);
      if (body.number === '5511000000000') {
        return json({ status: 400, error: 'Bad Request', response: { message: [{ exists: false, jid: '5511000000000@s.whatsapp.net', number: '5511000000000' }] } }, 400);
      }
      return json({ key: { remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, id: `EVO${calls.length}` }, status: 'PENDING' }, 201);
    }
    if (group === 'message' && action === 'sendMedia' && method === 'POST') {
      if (inst.state !== 'open') return json({ status: 400, error: 'Bad Request', response: { message: ['Connection Closed'] } }, 400);
      return json({ key: { remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, id: `EVOM${calls.length}` }, status: 'PENDING' }, 201);
    }
    if (group === 'chat' && action === 'sendPresence' && method === 'POST') return json({ presence: body.presence }, 201);
    if (group === 'message' && ['sendButtons', 'sendList', 'sendPoll'].includes(action) && method === 'POST') {
      if (inst.state !== 'open') return json({ status: 400, error: 'Bad Request', response: { message: ['Connection Closed'] } }, 400);
      return json({ key: { remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, id: `EVOI${calls.length}` }, status: 'PENDING' }, 201);
    }
    return new Response('Not found', { status: 404 });
  }
  const markOpen = (name, phone, profileName) => Object.assign(instances.get(name), { state: 'open', ownerJid: `${phone}@s.whatsapp.net`, profileName });
  return { request, calls, instances, store, media, markOpen };
}
