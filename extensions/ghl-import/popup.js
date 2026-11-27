// graao: Importar do GHL — a janela da extensão. Lê a subconta aberta na aba (reader.js, no mundo MAIN, só GET) e envia
// a leitura para o graao em pedaços, autenticada pelo código de importação gerado no graao. Nada é gravado no GHL.
// graao.com redireciona para www.graao.com, e um POST com cabeçalho próprio não segue redirecionamento ("Failed to fetch").
const DEFAULT_ORIGIN = 'https://www.graao.com';
// Endereços que já foram o padrão: guardados no storage, não contam como escolha de quem usa.
const OLD_DEFAULTS = ['https://graao.com', DEFAULT_ORIGIN];
const PIECE = 1000000; // caracteres por pedaço: em UTF-8 fica abaixo dos 3 MB que o graao aceita
const CODE = /^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/;
const $ = id => document.getElementById(id);

const show = (text, tone = '') => { $('status').textContent = text; $('status').className = `status ${tone}`; };
const progress = fraction => { $('bar').hidden = false; $('bar').firstElementChild.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`; };
const formatCode = value => {
  const plain = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 9);
  return plain.match(/.{1,3}/g)?.join('-') || '';
};
const cleanOrigin = (value, fallback = DEFAULT_ORIGIN) => {
  try {
    const url = new URL(value || fallback);
    if (!/^https?:$/.test(url.protocol)) return fallback;
    return url.origin === 'https://graao.com' ? DEFAULT_ORIGIN : url.origin;
  } catch { return fallback; }
};

/** O graao de onde esta pasta foi baixada (graao.json, gravado no .zip pelo próprio graao). */
async function bundledOrigin() {
  try {
    const response = await fetch(chrome.runtime.getURL('graao.json'));
    return response.ok ? cleanOrigin((await response.json()).origin) : DEFAULT_ORIGIN;
  } catch { return DEFAULT_ORIGIN; }
}

/** Mensagem clara quando o graao não responde (o fetch rejeita com "Failed to fetch"). */
const unreachable = origin => new Error(`Não consegui falar com o graao em ${origin}. Confira o endereço em Avançado: ele precisa ser o mesmo graao onde você gerou o código.`);

async function send(origin, code, path, body) {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Graao-Import-Code': code }, body: JSON.stringify(body) })
    .catch(() => { throw unreachable(origin); });
  if (response.ok) return response.json();
  const problem = await response.json().catch(() => ({}));
  // Diz qual graao respondeu: um código gerado num graao (por exemplo, o local) não vale em outro.
  throw new Error(`${problem.error || `O graao respondeu ${response.status}.`} (graao em ${origin})`);
}

async function start() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const locationId = String(tab?.url || '').match(/\/location\/([A-Za-z0-9]+)/)?.[1] || '';
  if (!locationId) { $('nolocation').hidden = false; return; }
  $('form').hidden = false;
  const bundled = await bundledOrigin();
  const saved = await chrome.storage.local.get('origin');
  $('origin').placeholder = bundled;
  $('origin').value = saved.origin && !OLD_DEFAULTS.includes(saved.origin) && saved.origin !== bundled ? saved.origin : '';
  // O título de "Avançado" mostra para onde vai o envio, sem precisar abrir (aberto, o popup passa da altura do Chrome).
  const where = () => { $('where').textContent = new URL(cleanOrigin($('origin').value.trim(), bundled)).host; };
  $('origin').addEventListener('input', where);
  where();
  $('code').addEventListener('input', event => { event.target.value = formatCode(event.target.value); });
  $('code').focus();

  $('form').addEventListener('submit', async event => {
    event.preventDefault();
    const code = formatCode($('code').value);
    if (!CODE.test(code)) return show('O código tem 9 letras e números, como ABC-234-XYZ.', 'bad');
    // Campo vazio: o graao de onde a extensão foi baixada. Só um endereço digitado fica guardado.
    const typed = $('origin').value.trim();
    const origin = cleanOrigin(typed, bundled);
    if (typed) await chrome.storage.local.set({ origin }); else await chrome.storage.local.remove('origin');
    $('form').querySelector('details').open = false;
    $('go').disabled = true;
    const target = { tabId: tab.id };
    let timer = null;
    try {
      show('Lendo a subconta no GHL…');
      progress(0.02);
      await chrome.scripting.executeScript({ target, world: 'MAIN', files: ['reader.js'] });
      timer = setInterval(async () => {
        const [read] = await chrome.scripting.executeScript({ target, world: 'MAIN', func: () => globalThis.__graaoGhlProgress || null }).catch(() => []);
        const step = read?.result;
        if (step) { show(`Lendo no GHL: ${step.step}…`); progress(0.05 + 0.6 * (step.done / step.total)); }
      }, 700);
      const [ran] = await chrome.scripting.executeScript({
        target, world: 'MAIN', args: [locationId, PIECE],
        func: async (L, piece) => {
          const host = [...document.querySelectorAll('*')].find(element => element.__vue_app__);
          const http = host?.__vue_app__?.config?.globalProperties?.$http;
          if (!http) return { error: 'Não encontrei o app do GHL nesta aba. Recarregue a página da subconta e tente de novo.' };
          const dump = await globalThis.graaoGhlReader.readLocation(http, L, step => { globalThis.__graaoGhlProgress = step; });
          return { parts: globalThis.graaoGhlReader.parts(dump, piece), errors: dump.errors.length };
        }
      });
      clearInterval(timer);
      const result = ran?.result;
      if (!result || result.error) throw new Error(result?.error || 'A leitura no GHL não terminou. Tente de novo.');
      const { parts } = result;
      for (const [i, part] of parts.entries()) {
        show(`Enviando para o graao (${i + 1} de ${parts.length})…`);
        progress(0.65 + 0.33 * (i / parts.length));
        await send(origin, code, '/api/ghl-import/part', part);
      }
      await send(origin, code, '/api/ghl-import/done', {});
      progress(1);
      show(result.errors ? `Enviado. Volte para o graao: a conversão começa sozinha (${result.errors} ${result.errors === 1 ? 'item não pôde ser lido e vai' : 'itens não puderam ser lidos e vão'} no relatório).` : 'Enviado. Volte para o graao: a conversão começa sozinha.', 'good');
    } catch (problem) {
      clearInterval(timer);
      show(problem.message || 'Não deu certo. Tente de novo.', 'bad');
      $('go').disabled = false;
    }
  });
}

start();
