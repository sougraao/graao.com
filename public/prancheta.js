import { icon as i } from './icons.js';
import { h, pageShell } from './screens.js';
import { ask } from './ask.js';

// Canonical Presets for social & content creators
export const pranchetaPresets = [
  { id: 'instagram-carousel', name: 'Carrossel / Retrato', width: 1080, height: 1350, ratio: '4:5', badge: 'Método HEAD' },
  { id: 'instagram-feed', name: 'Post Quadrado (Feed)', width: 1080, height: 1080, ratio: '1:1', badge: '1:1' },
  { id: 'story-reels', name: 'Story & Reels', width: 1080, height: 1920, ratio: '9:16', badge: '9:16' },
  { id: 'youtube-thumb', name: 'Capa Vídeo / YouTube', width: 1280, height: 720, ratio: '16:9', badge: '16:9' },
  { id: 'banner-web', name: 'Banner Web / Hero', width: 1920, height: 1080, ratio: '16:9', badge: 'Web' }
];

/**
 * Tela da Prancheta na graao. A rota do editor (#…/prancheta/editor/<id>) também
 * mostra a galeria: installPrancheta abre o editor por cima, num iframe.
 */
export function pranchetaScreen(c) {
  return renderGallery(c);
}

/**
 * Renders the gallery of subaccount design files and templates
 */
function renderGallery(c) {
  const files = (c.s.pranchetaFiles || []).slice().reverse();
  const query = (c.query || '').toLowerCase().trim();
  const filtered = query
    ? files.filter(f => (f.name || '').toLowerCase().includes(query) || (f.format || '').toLowerCase().includes(query))
    : files;

  const presetsHtml = `
    <div class="pr-presets-bar" role="region" aria-label="Formatos rápidos de criação">
      ${pranchetaPresets.map(p => `
        <button type="button" class="pr-preset-chip" data-act="pr-create-preset" data-preset="${h(p.id)}" data-w="${p.width}" data-h="${p.height}" data-name="${h(p.name)}">
          ${i('palette', 15)}
          <span>${h(p.name)}</span>
          <span class="pr-preset-dim">${p.width}×${p.height}</span>
        </button>
      `).join('')}
    </div>
  `;

  const templatesHtml = `
    <section class="pr-section-title">
      <h2>${i('spark', 16)} Modelos Estratégicos <span class="pr-badge-pill">Prontos para Usar</span></h2>
    </section>
    <div class="pr-template-grid">
      <article class="pr-template-card" data-act="pr-use-template" data-tpl="template-head-carousel">
        <div class="pr-template-preview">
          <span class="tpl-badge">MÉTODO HEAD · 3 SLIDES</span>
          <div class="tpl-headline">Como parar o feed e gerar desejo imediato.</div>
          <div class="tpl-sub">Carrossel estruturado: Gancho → Tensão → CTA</div>
        </div>
        <div class="pr-template-info">
          <h3>Carrossel de Alto Impacto</h3>
          <p>Estrutura visual comprovada para engajamento e retenção de carrosséis no Instagram.</p>
        </div>
      </article>

      <article class="pr-template-card" data-act="pr-use-template" data-tpl="template-quote-impact">
        <div class="pr-template-preview" style="background:#0D0D11">
          <span class="tpl-badge" style="color:var(--pr-sky)">EDITORIAL · AUTORIDADE</span>
          <div class="tpl-headline">“Estratégia precisa ser sentida. Marca é o que ela faz você fazer.”</div>
          <div class="tpl-sub">— Citação minimalista com contraste forte</div>
        </div>
        <div class="pr-template-info">
          <h3>Post Manifesto & Citação</h3>
          <p>Tipografia elegante e contrastante para frases, posicionamento e tweets de autoridade.</p>
        </div>
      </article>

      <article class="pr-template-card" data-act="pr-use-template" data-tpl="template-story-promo">
        <div class="pr-template-preview" style="background:#14141E">
          <span class="tpl-badge" style="color:var(--pr-yellow)">VERTICAL 9:16</span>
          <div class="tpl-headline">Transforme o conteúdo da marca em clientes reais.</div>
          <div class="tpl-sub">Story com headline de choque e botão de chamada</div>
        </div>
        <div class="pr-template-info">
          <h3>Story & Reels Promoção</h3>
          <p>Anúncio vertical dinâmico para lançamentos, ofertas e chamadas no Instagram.</p>
        </div>
      </article>
    </div>
  `;

  const isAgency = c.mode === 'agency' || location.hash.startsWith('#agency');
  const orgName = isAgency ? (c.s.company?.name || c.agency?.company?.name || 'Agência') : (c.s.profile?.name || 'Subconta');

  const filesHtml = filtered.length ? `
    <section class="pr-section-title">
      <h2>${i('folder', 16)} ${isAgency ? 'Artes da Agência' : 'Artes desta Subconta'} <span class="pr-badge-pill">${filtered.length}</span></h2>
    </section>
    <div class="pr-files-grid">
      ${filtered.map(f => {
        const slidesCount = (f.pages && f.pages.length) || 1;
        const updatedDate = f.updated ? new Date(f.updated).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';
        return `
          <article class="pr-file-card" data-id="${h(f.id)}">
            <div class="pr-file-thumb" data-act="pr-open-editor" data-id="${h(f.id)}">
              ${f.thumbnail ? `<img src="${h(f.thumbnail)}" alt="${h(f.name)}" loading="lazy">` : `
                <div class="pr-file-thumb-fallback">
                  <span class="pr-file-board" style="aspect-ratio:${Number(f.width) || 1080} / ${Number(f.height) || 1080};background:${/^#[0-9a-f]{3,8}$/i.test(f.pages?.[0]?.background || '') ? f.pages[0].background : '#101014'}">${i('palette', 22)}</span>
                  <span>${Number(f.width) || 1080} × ${Number(f.height) || 1080}</span>
                </div>
              `}
              <span class="pr-file-format-tag">${h(f.format || 'custom')}</span>
              ${slidesCount > 1 ? `<span class="pr-file-slides-tag">${slidesCount} slides</span>` : ''}
            </div>
            <div class="pr-file-body">
              <h3 class="pr-file-title" data-act="pr-open-editor" data-id="${h(f.id)}" title="${h(f.name)}">${h(f.name)}</h3>
              <div class="pr-file-meta">
                <span>${f.width || 1080}×${f.height || 1080} px</span>
                <span>${updatedDate}</span>
              </div>
            </div>
            <div class="pr-file-actions">
              <button type="button" class="primary-btn" data-act="pr-open-editor" data-id="${h(f.id)}" title="Abrir editor">
                ${i('edit', 13)} Editar
              </button>
              ${isAgency ? '' : `
              <button type="button" data-act="pr-export-drive" data-id="${h(f.id)}" title="Salvar no Mídia Drive da subconta">
                ${i('folder', 13)}
              </button>
              <button type="button" data-act="pr-to-social" data-id="${h(f.id)}" title="Agendar post com esta arte">
                ${i('send', 13)}
              </button>
              `}
              <button type="button" data-act="pr-duplicate" data-id="${h(f.id)}" title="Duplicar">
                ${i('copy', 13)}
              </button>
              <button type="button" data-act="pr-delete" data-id="${h(f.id)}" title="Excluir">
                ${i('trash', 13)}
              </button>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  ` : `
    <div class="pr-empty-box">
      ${i('palette', 48)}
      <h3>${isAgency ? 'Nenhuma arte criada na agência' : 'Nenhuma arte criada nesta subconta'}</h3>
      <p>${isAgency ? 'Crie sua primeira arte vetorial para a agência, escolha um modelo estratégico ou clique num formato acima.' : 'Crie sua primeira arte vetorial, escolha um modelo estratégico ou clique num formato acima para começar.'}</p>
      <button type="button" class="primary" data-act="pr-create-modal">${i('plus', 16)} Nova arte em branco</button>
    </div>
  `;

  const content = `
    <div class="pr-gallery-wrap">
      ${presetsHtml}
      ${templatesHtml}
      ${filesHtml}
    </div>
  `;

  return pageShell({
    title: 'Prancheta Criativa',
    desc: isAgency
      ? 'Estúdio de design vetorial da agência. Crie carrosséis, posts, stories e capas com visual oficial da graao.'
      : `Estúdio de design vetorial da subconta ${h(orgName)}. Crie carrosséis, posts, stories e capas com visual oficial da graao.`,
    cta: `
      <button type="button" class="secondary" data-act="pr-import-json">${i('upload', 15)} Importar JSON</button>
      <button type="button" class="primary" data-act="pr-create-modal">${i('plus', 15)} Nova Arte</button>
    `,
    tabs: {
      key: 'prancheta-view',
      items: [
        ['files', 'Minhas Artes'],
        ['templates', 'Modelos Oficiais']
      ],
      current: 'files',
      label: 'Navegação da Prancheta'
    },
    content
  });
}

/**
 * Liga a galeria às ações e abre o editor da Prancheta (prancheta-editor/src,
 * servido em /prancheta-editor.html) num iframe em tela cheia sobre a galeria.
 */
export function installPrancheta({ c, mutate, flash, render, getState, account }) {
  const isAgencyRoute = () => location.hash.startsWith('#agency');
  const getBaseHash = () => isAgencyRoute() ? '#agency/prancheta' : '#prancheta';
  const getFiles = () => (getState ? getState() : c.s)?.pranchetaFiles || [];
  const editorRoute = () => {
    const parts = location.hash.slice(1).split('?')[0].split('/');
    const offset = parts[0] === 'agency' ? 1 : 0;
    if (parts[offset] !== 'prancheta' || parts[offset + 1] !== 'editor' || !parts[offset + 2]) return null;
    return { id: decodeURIComponent(parts[offset + 2]), workspace: offset ? 'agency' : (c.workspace || 'demo') };
  };

  // Uma ação pedida da galeria (Mídia Drive, post) roda dentro do editor, que gera o PNG em alta resolução.
  let pendingAction = '';
  let frame = null;
  let frameFile = '';
  let closing = false;

  const closeEditor = () => {
    frame?.remove();
    frame = null;
    frameFile = '';
    document.documentElement.classList.remove('pr-editor-open');
  };

  const syncEditor = () => {
    const route = editorRoute();
    if (!route) { closeEditor(); return; }
    if (frame && frameFile === route.id) return;
    const query = new URLSearchParams({ workspace: route.workspace, file: route.id });
    if (pendingAction) query.set('action', pendingAction);
    if (account()) query.set('account', account());   // account-guard.js: o editor só fala por esta conta
    pendingAction = '';
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'pr-editor-frame';
      frame.title = 'Editor da Prancheta';
      frame.setAttribute('allow', 'clipboard-read; clipboard-write');
      document.body.append(frame);
      document.documentElement.classList.add('pr-editor-open');
    }
    frameFile = route.id;
    frame.src = `/prancheta-editor.html?${query}`;
    frame.focus();
  };

  window.addEventListener('hashchange', syncEditor);
  queueMicrotask(syncEditor);

  window.addEventListener('message', async (event) => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== 'prancheta-editor') return;
    if (msg.type === 'opened' && typeof msg.id === 'string' && msg.id !== frameFile) {
      // O editor criou ou abriu outra arte (Novo arquivo, cópia, importação): só acompanha o endereço.
      frameFile = msg.id;
      history.replaceState(null, '', `${location.pathname}${location.search}${getBaseHash()}/editor/${encodeURIComponent(msg.id)}`);
      return;
    }
    if (msg.type === 'close' && !closing) {
      closing = true;
      try {
        if (typeof msg.id === 'string' && typeof msg.thumbnail === 'string' && msg.thumbnail) {
          // Passa pelo mutate para a galeria receber o estado novo (nome, miniatura, lâminas).
          await mutate({ type: 'prancheta-save', id: msg.id, data: { thumbnail: msg.thumbnail } }).catch(() => {});
        }
      } finally {
        closing = false;
        location.hash = getBaseHash();
        render();
      }
    }
  });

  document.addEventListener('click', async (e) => {
    // Blank creation modal / button
    const createModalBtn = e.target.closest('[data-act="pr-create-modal"]');
    if (createModalBtn) {
      const newId = await mutate({
        type: 'prancheta-save',
        data: {
          name: `Arte em Branco #${(getFiles().length || 0) + 1}`,
          format: 'instagram-feed',
          width: 1080,
          height: 1080,
          pages: [
            {
              id: 'slide-1',
              name: 'Lâmina 1',
              background: '#101014',
              nodes: [
                {
                  id: 'headline-1',
                  type: 'TEXT',
                  x: 108,
                  y: 400,
                  width: 864,
                  height: 120,
                  text: 'Seu título de impacto aqui',
                  fontSize: 60,
                  fontWeight: 800,
                  fills: [{ type: 'SOLID', color: '#FFFFFF' }]
                }
              ]
            }
          ]
        }
      });
      location.hash = `${getBaseHash()}/editor/${newId}`;
      return;
    }

    const chip = e.target.closest('[data-act="pr-create-preset"]');
    if (chip) {
      const format = chip.dataset.preset;
      const width = Number(chip.dataset.w) || 1080;
      const height = Number(chip.dataset.h) || 1080;
      const formatName = chip.dataset.name || 'Nova Arte';

      const newId = await mutate({
        type: 'prancheta-save',
        data: {
          name: `${formatName} #${(getFiles().length || 0) + 1}`,
          format,
          width,
          height,
          pages: [
            {
              id: 'slide-1',
              name: 'Lâmina 1',
              background: '#101014',
              nodes: [
                {
                  id: 'headline-1',
                  type: 'TEXT',
                  x: Math.round(width * 0.1),
                  y: Math.round(height * 0.35),
                  width: Math.round(width * 0.8),
                  height: 120,
                  text: 'Seu título de impacto aqui',
                  fontSize: Math.round(width * 0.055),
                  fontWeight: 800,
                  fills: [{ type: 'SOLID', color: '#FFFFFF' }]
                }
              ]
            }
          ]
        }
      });

      location.hash = `${getBaseHash()}/editor/${newId}`;
      return;
    }

    // Use strategic canonical template
    const tplCard = e.target.closest('[data-act="pr-use-template"]');
    if (tplCard) {
      const templateId = tplCard.dataset.tpl;
      const newId = await mutate({
        type: 'prancheta-template',
        data: { templateId }
      });
      flash('Modelo criado com sucesso!');
      location.hash = `${getBaseHash()}/editor/${newId}`;
      return;
    }

    // Open editor
    const openBtn = e.target.closest('[data-act="pr-open-editor"]');
    if (openBtn) {
      const id = openBtn.dataset.id;
      if (id) location.hash = `${getBaseHash()}/editor/${id}`;
      return;
    }

    // Duplicate
    const dupBtn = e.target.closest('[data-act="pr-duplicate"]');
    if (dupBtn) {
      const id = dupBtn.dataset.id;
      if (id) {
        await mutate({ type: 'prancheta-duplicate', id });
        flash('Arte duplicada com sucesso!');
        render();
      }
      return;
    }

    // Delete
    const delBtn = e.target.closest('[data-act="pr-delete"]');
    if (delBtn) {
      const id = delBtn.dataset.id;
      if (id && await ask('Excluir esta arte?', { ok: 'Excluir' })) {
        await mutate({ type: 'prancheta-delete', id });
        flash('Arte excluída.');
        render();
      }
      return;
    }

    // Mídia Drive e Social Planner: abre a arte no editor, que exporta em alta resolução e envia.
    const sendBtn = e.target.closest('[data-act="pr-export-drive"], [data-act="pr-to-social"]');
    if (sendBtn) {
      const id = sendBtn.dataset.id;
      if (!id) return;
      pendingAction = sendBtn.dataset.act === 'pr-to-social' ? 'social' : 'drive';
      location.hash = `${getBaseHash()}/editor/${encodeURIComponent(id)}`;
      return;
    }

    // Importar um arquivo .prancheta.json (o mesmo que o editor baixa em "Salvar cópia local").
    if (e.target.closest('[data-act="pr-import-json"]')) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          if (file.size > 25 * 1024 * 1024) throw new Error('Este arquivo passou de 25 MB.');
          const doc = JSON.parse(await file.text());
          if (!doc || !Array.isArray(doc.pages) || !doc.nodes || typeof doc.nodes !== 'object') throw new Error('Este JSON não é um arquivo da Prancheta.');
          const name = String(doc.name || file.name.replace(/\.prancheta\.json$|\.json$/i, '') || 'Arte importada').slice(0, 150);
          const newId = await mutate({ type: 'prancheta-save', data: { name, document: { ...doc, name } } });
          flash('Arte importada.');
          location.hash = `${getBaseHash()}/editor/${encodeURIComponent(newId)}`;
        } catch (error) {
          flash(error instanceof SyntaxError ? 'Este arquivo não é um JSON válido.' : error.message);
        }
      });
      input.click();
    }
  });
}
