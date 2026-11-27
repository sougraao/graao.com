// Janela "Importar do GHL" (Setups de conta): o passo a passo, o código de importação, o andamento e o relatório.
// Só monta o HTML; quem abre a janela, consulta o andamento e avança os passos é o agency.js.
import { icon } from './icons.js';
const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);

/** Onde instalar a extensão (até a aprovação na Chrome Web Store, o artigo da central de ajuda explica como carregar). */
export const GHL_EXTENSION_URL = 'https://doc.graao.com/agencia/importar-do-ghl/';
/** Fases em que a janela do graao avança a conversão. */
export const GHL_RUNNING = ['received', 'pages', 'converting', 'images', 'saving'];

const ratio = (done, total) => total ? Math.min(1, done / total) : 0;

/** O texto e a fração (0 a 1) do andamento de uma importação. */
export function ghlPhase(job) {
  const { status, pagesDone = 0, pagesTotal = 0, imagesDone = 0, imagesTotal = 0 } = job || {};
  switch (status) {
    case 'waiting': return { text: 'Esperando a extensão…', fraction: 0 };
    case 'receiving': return { text: 'Recebendo os dados do GHL…', fraction: 0.05 };
    case 'received': return { text: 'Preparando a conversão…', fraction: 0.08 };
    case 'pages': return { text: `Baixando páginas ${pagesDone}/${pagesTotal}`, fraction: 0.1 + 0.4 * ratio(pagesDone, pagesTotal) };
    case 'converting': return { text: 'Convertendo', fraction: 0.52 };
    case 'images': return { text: `Copiando imagens ${imagesDone}/${imagesTotal}`, fraction: 0.55 + 0.4 * ratio(imagesDone, imagesTotal) };
    case 'saving': return { text: 'Salvando o setup', fraction: 0.97 };
    case 'done': return { text: 'Pronto', fraction: 1 };
    default: return { text: 'A importação parou', fraction: 1 };
  }
}

const bar = fraction => `<span class="ag-bar"><span data-w="${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}"></span></span>`;

/** O andamento (ou o relatório, no fim) de uma importação. `summary` é a contagem do setup pronto ("2 workflows · …"). */
export function ghlImportState(job, { summary = '' } = {}) {
  const phase = ghlPhase(job);
  if (job?.status === 'done') {
    const notes = job.notes?.length
      ? `<h3>Antes de usar, confira</h3><ul class="ag-ghl-notes">${job.notes.map(text => `<li>${h(text)}</li>`).join('')}</ul>`
      : '<p class="dim">Nada precisa de ajuste: tudo foi convertido.</p>';
    return `<div class="ag-ghl-report"><p class="ag-ghl-ok"><b>Setup criado em Importados.</b>${summary ? ` ${h(summary)}.` : ''}</p>${notes}
      <div class="inline-gap"><button class="primary" data-ag="ghl-view-setup" data-id="${h(job.snapshotId)}">${icon('folder', 15)}Ver setup</button></div></div>`;
  }
  if (job?.status === 'failed') {
    return `<div class="ag-ghl-report"><p class="form-status" role="alert">${h(job.error || 'A importação parou.')}</p>
      <div class="inline-gap"><button class="primary" data-ag="ghl-import">${icon('refresh', 15)}Tentar de novo</button></div></div>`;
  }
  return `<div class="ag-progress"><p><b>${h(phase.text)}</b></p>${bar(phase.fraction)}</div>`;
}

/** O corpo da janela: os 3 passos, o link da extensão, o código e o lugar do andamento. */
export function ghlImportBody({ code, expiresAt, now = Date.now(), job = { status: 'waiting' } }) {
  const minutes = Math.max(1, Math.round((expiresAt - now) / 60000));
  return `<ol class="ag-ghl-steps">
      <li>No GHL, abra a subconta onde o snapshot está carregado.</li>
      <li>Clique na extensão <b>graao: Importar do GHL</b> e cole o código abaixo.</li>
      <li>Deixe esta janela aberta: a conversão começa sozinha quando os dados chegarem.</li>
    </ol>
    <p class="inline-gap"><a class="secondary ag-ghl-link" href="${h(GHL_EXTENSION_URL)}" target="_blank" rel="noopener">${icon('download', 15)}Instalar no Chrome</a></p>
    <div class="ag-ghl-code"><span class="ag-ghl-value" aria-label="Código de importação">${h(code)}</span><button type="button" class="secondary" data-ag="copy" data-text="${h(code)}">${icon('copy', 15)}Copiar</button></div>
    <p class="dim">O código vale ${minutes} min e serve uma vez. O graao nunca recebe sua senha do GHL.</p>
    <div data-ghl-state>${ghlImportState(job)}</div>`;
}
