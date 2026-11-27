// Pergunte à Graao — backend de conversas com árvore de ramos, streaming SSE,
// contexto vivo da agência e integração com OpenAI / provedores compatíveis.
import { randomUUID } from 'node:crypto';

export const DEFAULT_TITLE = 'Novo chat';
const OPENAI_URL = 'https://api.openai.com/v1';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const NON_CHAT = /(audio|realtime|tts|transcribe|image|embedding|whisper|moderation|instruct|search|live|robotics|computer-use|customtools|nano-banana|translate)/;
const DEFAULT_OPENAI_MODELS = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'o4-mini'];
const MAX_STORED_CONVS = 200;
const MAX_TEMP_CONVS = 40;
const MAX_ASK_BODY = 16 * 1024 * 1024;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMoney = v => brl.format(Number(v) || 0);
const nowSec = () => Date.now() / 1000;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const chatRowId = agencyId => `chat-${agencyId}`;

export function messageText(message) {
  const parts = message?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.filter(p => typeof p === 'string').join('\n');
}

function hasMessages(conv) {
  return Boolean(conv?.mapping) && Object.values(conv.mapping).some(n => n?.message && n.message.author?.role !== 'system');
}

function rootId(conv) {
  return Object.values(conv.mapping).find(n => !n.parent)?.id;
}

function deepestLeaf(mapping) {
  const root = Object.values(mapping).find(n => !n.parent);
  let node = root;
  while (node && node.children?.length && mapping[node.children[node.children.length - 1]]) {
    node = mapping[node.children[node.children.length - 1]];
  }
  return node?.id || root?.id;
}

function pathMessages(conv, leafId) {
  const out = [];
  let node = conv.mapping[leafId];
  while (node) {
    if (node.message) out.push(node.message);
    node = node.parent ? conv.mapping[node.parent] : null;
  }
  return out.reverse();
}

function createConv({ temporary = false } = {}) {
  const root = randomUUID();
  return {
    id: randomUUID(),
    title: DEFAULT_TITLE,
    create_time: nowSec(),
    update_time: nowSec(),
    temporary: Boolean(temporary),
    current_node: root,
    mapping: { [root]: { id: root, message: null, parent: null, children: [] } }
  };
}

function addMessageToConv(conv, parentId, message) {
  const parent = conv.mapping[parentId];
  if (!parent) throw fail('Mensagem pai não encontrada.', 400);
  conv.mapping[message.id] = { id: message.id, message, parent: parentId, children: [] };
  parent.children.push(message.id);
  conv.current_node = message.id;
  conv.update_time = nowSec();
}

function sanitizeUserMessage(raw, conv) {
  const text = typeof raw?.content?.parts?.[0] === 'string' ? raw.content.parts[0].slice(0, 40000) : '';
  const attachments = Array.isArray(raw?.metadata?.attachments)
    ? raw.metadata.attachments
        .filter(a => a && ((a.kind === 'image' && /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(a.dataUrl || '')) || (a.kind === 'file' && typeof a.text === 'string')))
        .slice(0, 10)
        .map(a => ({
          id: String(a.id || randomUUID()).slice(0, 64),
          kind: a.kind,
          name: String(a.name || 'arquivo').slice(0, 200),
          size: Number(a.size) || 0,
          ...(a.kind === 'image' ? { dataUrl: a.dataUrl } : { text: a.text.slice(0, 512 * 1024) })
        }))
    : [];
  if (!text.trim() && !attachments.length) return null;
  const id = typeof raw?.id === 'string' && /^[\w-]{8,64}$/.test(raw.id) && !conv.mapping[raw.id] ? raw.id : randomUUID();
  return {
    id,
    author: { role: 'user' },
    content: { content_type: 'text', parts: [text] },
    create_time: nowSec(),
    metadata: attachments.length ? { attachments } : {}
  };
}

export function parseSkillMd(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]+([\s\S]*)$/);
  if (!match) {
    return {
      name: 'Habilidade Importada',
      description: text.slice(0, 150),
      instructions: text
    };
  }
  const frontmatter = match[1];
  const instructions = match[2].trim();
  let name = 'Nova Habilidade';
  let description = '';
  for (const line of frontmatter.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    if (key === 'name') name = val;
    if (key === 'description') description = val;
  }
  return { name, description, instructions };
}

// ---------- Persistência via store da Graao ----------

function createChatStore(store) {
  const tempByAgency = new Map();

  function tempMap(agencyId) {
    let map = tempByAgency.get(agencyId);
    if (!map) {
      map = new Map();
      tempByAgency.set(agencyId, map);
    }
    return map;
  }

  function rememberTemp(agencyId, conv) {
    const map = tempMap(agencyId);
    map.set(conv.id, conv);
    if (map.size > MAX_TEMP_CONVS) {
      const oldest = map.keys().next().value;
      if (oldest) map.delete(oldest);
    }
  }

  async function ensureRow(agencyId) {
    const id = chatRowId(agencyId);
    try {
      const row = await store.load(id);
      if (!row.profile?.name) row.profile = { name: 'Pergunte à Graao', ...(row.profile || {}) };
      if (typeof row.instructions !== 'string') row.instructions = '';
      if (!Array.isArray(row.conversations)) row.conversations = [];
      if (!Array.isArray(row.skills)) row.skills = [];
      return row;
    } catch (err) {
      if (err.status !== 404) throw err;
      await store.insert(id, {
        profile: { name: 'Pergunte à Graao' },
        instructions: '',
        conversations: [],
        skills: []
      });
      return store.load(id);
    }
  }

  async function changeRow(agencyId, mutate) {
    await ensureRow(agencyId);
    return store.change(chatRowId(agencyId), row => {
      if (!row.profile?.name) row.profile = { name: 'Pergunte à Graao', ...(row.profile || {}) };
      if (typeof row.instructions !== 'string') row.instructions = '';
      if (!Array.isArray(row.conversations)) row.conversations = [];
      if (!Array.isArray(row.skills)) row.skills = [];
      // O conector externo de busca saiu; tokens antigos guardados aqui são apagados na próxima gravação.
      delete row.connectors;
      return mutate(row);
    });
  }

  function summarizeList(conversations) {
    return conversations
      .filter(hasMessages)
      .map(({ id, title, create_time, update_time }) => ({ id, title, create_time, update_time }))
      .sort((a, b) => (b.update_time || 0) - (a.update_time || 0));
  }

  return {
    async list(agencyId) {
      const row = await ensureRow(agencyId);
      return summarizeList(row.conversations);
    },

    async getInstructions(agencyId) {
      const row = await ensureRow(agencyId);
      return row.instructions || '';
    },

    async setInstructions(agencyId, instructions) {
      const clean = typeof instructions === 'string' ? instructions.trim().slice(0, 4000) : '';
      return changeRow(agencyId, row => {
        row.instructions = clean;
        return { instructions: row.instructions };
      });
    },

    async getSkills(agencyId) {
      const row = await ensureRow(agencyId);
      return Array.isArray(row.skills) ? row.skills : [];
    },

    async saveSkill(agencyId, skillData) {
      return changeRow(agencyId, row => {
        row.skills = Array.isArray(row.skills) ? row.skills : [];
        const id = skillData.id || randomUUID();
        const existingIdx = row.skills.findIndex(s => s.id === id);
        const skill = {
          id,
          name: String(skillData.name || '').trim().slice(0, 100) || 'Nova Habilidade',
          description: String(skillData.description || '').trim().slice(0, 500),
          instructions: String(skillData.instructions || '').trim().slice(0, 10000),
          enabled: skillData.enabled !== false,
          updatedAt: new Date().toISOString()
        };
        if (existingIdx >= 0) {
          row.skills[existingIdx] = { ...row.skills[existingIdx], ...skill };
        } else {
          row.skills.push({ ...skill, createdAt: new Date().toISOString() });
        }
        return row.skills;
      });
    },

    async deleteSkill(agencyId, skillId) {
      return changeRow(agencyId, row => {
        row.skills = (Array.isArray(row.skills) ? row.skills : []).filter(s => s.id !== skillId);
        return row.skills;
      });
    },

    async get(agencyId, id) {
      const temp = tempMap(agencyId).get(id);
      if (temp) return temp;
      const row = await ensureRow(agencyId);
      return row.conversations.find(c => c.id === id) || null;
    },

    async save(agencyId, conv) {
      if (conv.temporary) {
        rememberTemp(agencyId, conv);
        return conv;
      }
      await changeRow(agencyId, row => {
        const idx = row.conversations.findIndex(c => c.id === conv.id);
        if (idx >= 0) row.conversations[idx] = conv;
        else row.conversations.unshift(conv);
        if (row.conversations.length > MAX_STORED_CONVS) {
          row.conversations.sort((a, b) => (b.update_time || 0) - (a.update_time || 0));
          row.conversations.length = MAX_STORED_CONVS;
        }
      });
      return conv;
    },

    async rename(agencyId, id, title) {
      const clean = String(title || '').trim().slice(0, 200) || DEFAULT_TITLE;
      const temp = tempMap(agencyId).get(id);
      if (temp) {
        temp.title = clean;
        temp.update_time = nowSec();
        return { id: temp.id, title: temp.title, current_node: temp.current_node };
      }
      return changeRow(agencyId, row => {
        const conv = row.conversations.find(c => c.id === id);
        if (!conv) throw fail('Conversa não encontrada.', 404);
        conv.title = clean;
        conv.update_time = nowSec();
        return { id: conv.id, title: conv.title, current_node: conv.current_node };
      });
    },

    async setBranch(agencyId, id, currentNode) {
      const temp = tempMap(agencyId).get(id);
      if (temp) {
        if (!temp.mapping[currentNode]) throw fail('Mensagem não encontrada.', 400);
        temp.current_node = currentNode;
        return { id: temp.id, title: temp.title, current_node: temp.current_node };
      }
      return changeRow(agencyId, row => {
        const conv = row.conversations.find(c => c.id === id);
        if (!conv) throw fail('Conversa não encontrada.', 404);
        if (!conv.mapping[currentNode]) throw fail('Mensagem não encontrada.', 400);
        conv.current_node = currentNode;
        return { id: conv.id, title: conv.title, current_node: conv.current_node };
      });
    },

    async setFeedback(agencyId, id, messageId, rating) {
      const clean = rating === 'up' || rating === 'down' ? rating : null;
      const temp = tempMap(agencyId).get(id);
      if (temp) {
        const msg = temp.mapping[messageId]?.message;
        if (!msg) throw fail('Mensagem não encontrada.', 404);
        msg.metadata = { ...msg.metadata, feedback: clean || undefined };
        return { ok: true, rating: clean };
      }
      return changeRow(agencyId, row => {
        const conv = row.conversations.find(c => c.id === id);
        if (!conv) throw fail('Conversa não encontrada.', 404);
        const msg = conv.mapping[messageId]?.message;
        if (!msg) throw fail('Mensagem não encontrada.', 404);
        msg.metadata = { ...msg.metadata, feedback: clean || undefined };
        return { ok: true, rating: clean };
      });
    },

    async remove(agencyId, id) {
      tempMap(agencyId).delete(id);
      return changeRow(agencyId, row => {
        const before = row.conversations.length;
        row.conversations = row.conversations.filter(c => c.id !== id);
        if (row.conversations.length === before) throw fail('Conversa não encontrada.', 404);
        return { ok: true };
      });
    },

    async removeAll(agencyId) {
      tempMap(agencyId).clear();
      await changeRow(agencyId, row => { row.conversations = []; });
      return { ok: true };
    },

    async search(agencyId, query, limit = 30) {
      const row = await ensureRow(agencyId);
      const q = String(query || '').trim().toLowerCase();
      if (!q) return summarizeList(row.conversations).slice(0, limit);
      const results = [];
      for (const conv of row.conversations) {
        if (!hasMessages(conv)) continue;
        let snippet = '';
        const inTitle = (conv.title || '').toLowerCase().includes(q);
        for (const node of Object.values(conv.mapping || {})) {
          const text = messageText(node?.message);
          const at = text.toLowerCase().indexOf(q);
          if (at >= 0) {
            snippet = (at > 40 ? '…' : '') + text.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, ' ');
            break;
          }
        }
        if (inTitle || snippet) {
          results.push({ id: conv.id, title: conv.title, update_time: conv.update_time, snippet });
        }
      }
      return results.sort((a, b) => (b.update_time || 0) - (a.update_time || 0)).slice(0, limit);
    },

    async exportAll(agencyId) {
      const row = await ensureRow(agencyId);
      return row.conversations.filter(hasMessages);
    },

    async importList(agencyId, list) {
      if (!Array.isArray(list)) throw fail('O arquivo deve conter uma lista de conversas.', 400);
      return changeRow(agencyId, row => {
        const existing = new Set(row.conversations.map(c => c.id));
        let imported = 0;
        for (const item of list.slice(0, 100)) {
          if (!item || typeof item.mapping !== 'object' || !item.mapping) continue;
          const id = String(item.id || item.conversation_id || randomUUID()).slice(0, 80);
          if (existing.has(id)) continue;
          const mapping = {};
          for (const [key, node] of Object.entries(item.mapping)) {
            if (!node || typeof node !== 'object') continue;
            mapping[key] = {
              id: node.id || key,
              message: node.message || null,
              parent: node.parent || null,
              children: Array.isArray(node.children) ? node.children : []
            };
          }
          const current = item.current_node && mapping[item.current_node] ? item.current_node : null;
          const conv = {
            id,
            title: String(item.title || DEFAULT_TITLE).slice(0, 200),
            create_time: Number(item.create_time) || nowSec(),
            update_time: Number(item.update_time || item.create_time) || nowSec(),
            temporary: false,
            current_node: current || deepestLeaf(mapping),
            mapping
          };
          if (!hasMessages(conv)) continue;
          row.conversations.unshift(conv);
          existing.add(id);
          imported += 1;
        }
        if (row.conversations.length > MAX_STORED_CONVS) {
          row.conversations.sort((a, b) => (b.update_time || 0) - (a.update_time || 0));
          row.conversations.length = MAX_STORED_CONVS;
        }
        return imported;
      });
    }
  };
}

// ---------- Contexto vivo da agência e assistente local ----------

export function buildAgencyContext({ agency, overview }) {
  const t = overview.totals;
  const accounts = overview.accounts || [];
  const company = agency.company || {};
  const lines = [
    `Agência: ${company.name || 'Minha agência'}`,
    `MRR (planos SaaS ativos): ${fmtMoney(t.mrr)}`,
    `Subcontas: ${t.accounts} no total (${t.active} ativas, ${t.paused} pausadas, ${t.closed} encerradas, ${t.newThisMonth} novas neste mês)`,
    `Contatos totais: ${t.contacts} | Oportunidades abertas: ${t.open} | Execuções de automação: ${t.runs} | Saldo da carteira: ${fmtMoney(t.wallet)}`,
    `Planos SaaS: ${agency.plans?.length || 0} | Setups de conta salvos: ${agency.snapshots?.length || 0} (${agency.snapshotLoads?.length || 0} carregamentos) | Equipe: ${agency.users?.length || 0} usuário(s) | Prospects: ${agency.prospects?.length || 0}`
  ];
  if (accounts.length) {
    lines.push('Subcontas cadastradas:');
    for (const a of accounts.slice(0, 30)) {
      lines.push(`- ${a.name} | Status: ${a.status} | Plano: ${a.plan || 'Sem plano'} | Contatos: ${a.contacts} | Oportunidades abertas: ${a.open} | Último login: ${a.lastLogin || 'Nunca'}`);
    }
  }
  if (agency.plans?.length) {
    lines.push('Planos SaaS:');
    for (const p of agency.plans.slice(0, 15)) {
      lines.push(`- ${p.name}: ${fmtMoney(p.price)}/mês`);
    }
  }
  return lines.join('\n');
}

export async function localAgencyReply({ prompt, agency, overview, attachments = [] }) {
  const t = overview.totals;
  const accounts = overview.accounts || [];
  const q = String(prompt || '').toLowerCase();
  const files = attachments.filter(a => a.kind === 'file');
  const images = attachments.filter(a => a.kind === 'image');

  if (files.length && !/receita|mrr|contato|login|snapshot|setup|plano|equipe|prospect|subconta|próximo|proximo/.test(q)) {
    const fileList = files.map(f => `- **${f.name}** (${f.text.split('\n').length} linhas, ${f.text.length} caracteres)`).join('\n');
    const preview = files[0].text.slice(0, 600).trim();
    return `Recebi ${files.length === 1 ? 'o arquivo anexado' : `${files.length} arquivos anexados`}:\n\n${fileList}\n\nPrévia de **${files[0].name}**:\n\n\`\`\`\n${preview}${files[0].text.length > 600 ? '\n…' : ''}\n\`\`\`\n\n> Para análises generativas profundas de arquivos e imagens, conecte sua chave da OpenAI em **Configurações → OpenAI**.`;
  }

  if (images.length && !q.trim()) {
    return `Recebi ${images.length === 1 ? '1 imagem' : `${images.length} imagens`} na conversa.\n\nNo modo **Assistente local**, consigo responder sobre os dados da agência em tempo real. Para análise visual de imagens, conecte sua chave da OpenAI em **Configurações → OpenAI**.`;
  }

  if (/receita|mrr|revenue|money|faturamento|carteira|wallet/.test(q)) {
    const planRows = (agency.plans || []).map(p => {
      const count = accounts.filter(a => a.status === 'Active' && a.plan === p.name).length;
      return `| ${p.name} | ${fmtMoney(p.price)} | ${count} | ${fmtMoney(count * (Number(p.price) || 0))} |`;
    });
    return `### Receita recorrente mensal (MRR)\n\nO **MRR atual** dos planos SaaS é de **${fmtMoney(t.mrr)}** distribuído em **${t.active}** subconta(s) ativa(s).\n\n- **Saldo da carteira:** ${fmtMoney(t.wallet)}\n- **Planos cadastrados:** ${agency.plans?.length || 0}\n- **AbacatePay:** ${agency.abacatepay?.connected ? 'Conectado (assinaturas cobradas por Pix ou cartão)' : 'Não conectado (KPIs calculados por registros locais)'}\n\n${planRows.length ? `| Plano | Mensalidade | Subcontas ativas | MRR |\n|---|---|---:|---:|\n${planRows.join('\n')}` : '> Nenhum plano SaaS foi criado ainda. Configure o primeiro em **Configurador SaaS → Planos SaaS**.'}`;
  }

  if (/contato|contatos|contact|biggest|most|maior/.test(q)) {
    const sorted = [...accounts].sort((a, b) => (b.contacts || 0) - (a.contacts || 0));
    if (!sorted.length) return 'Ainda não há subcontas cadastradas nesta agência.';
    const top = sorted[0];
    const rows = sorted.slice(0, 8).map(a => `| ${a.name} | ${a.status} | ${a.contacts} | ${a.open} |`);
    return `### Ranking de contatos por subconta\n\n**${top.name}** lidera com **${top.contacts}** contato(s) cadastrado(s), de um total de **${t.contacts}** contato(s) em toda a agência.\n\n| Subconta | Status | Contatos | Oportunidades abertas |\n|---|---|---:|---:|\n${rows.join('\n')}`;
  }

  if (/login|inativo|acesso|logged|sem acesso/.test(q)) {
    const idle = accounts.filter(a => !a.lastLogin);
    if (!idle.length) return `Todas as **${accounts.length}** subconta(s) cadastradas já registraram login recentemente.`;
    return `### Subcontas sem registro de login\n\nEncontrei **${idle.length}** subconta(s) que ainda não realizaram login:\n\n${idle.map(a => `- **${a.name}** (${a.status}${a.plan ? ` · Plano ${a.plan}` : ''})`).join('\n')}\n\n**Sugestão:** envie um onboarding guiado ou agende uma sessão de ativação com os responsáveis dessas contas.`;
  }

  if (/snapshot|setup|marketplace/.test(q)) {
    const snaps = agency.snapshots || [];
    if (!snaps.length) return 'Você ainda não tem setups salvos na sua biblioteca.\n\nExplore o **Marketplace** em **Setups de conta** para adicionar setups prontos da Graao e da comunidade gratuitamente, ou crie um setup a partir da sua melhor subconta.';
    return `### Setups de conta da agência\n\nVocê possui **${snaps.length}** setup(s) na biblioteca e **${agency.snapshotLoads?.length || 0}** carregamento(s) registrado(s):\n\n${snaps.slice(0, 10).map(s => `- **${s.name}** (v${s.version || 1}${s.published ? ' · Publicado no marketplace' : s.kind === 'marketplace' ? ` · Marketplace (${s.marketplaceAuthor || 'Graao'})` : ''})`).join('\n')}`;
  }

  if (/equipe|time|usuário|usuario|team|membro/.test(q)) {
    const users = agency.users || [];
    if (!users.length) return 'Nenhum membro adicional foi convidado ainda.\n\nAdicione sua equipe em **Configurações → Equipe** definindo funções e permissões por subconta.';
    return `### Equipe da agência\n\nHá **${users.length}** membro(s) cadastrado(s):\n\n${users.slice(0, 15).map(u => `- **${u.first} ${u.last}** — ${u.role} (${u.email})`).join('\n')}`;
  }

  if (/prospect|prospecção|prospeccao|lead/.test(q)) {
    const prospects = (agency.prospects || []).filter(p => !p.archived);
    if (!prospects.length) return 'Nenhum prospect ativo encontrado no módulo de **Prospecção**.\n\nUse **Prospecção → Buscar prospects** para encontrar empresas e gerar auditorias.';
    return `### Pipeline de prospecção\n\nVocê acompanha **${prospects.length}** prospect(s) ativo(s):\n\n${prospects.slice(0, 10).map(p => `- **${p.name}** — ${p.status}${p.city ? ` (${p.city})` : ''}`).join('\n')}`;
  }

  if (/subconta|contas|clientes|resumo|visão geral|visao geral|painel|status/.test(q)) {
    const rows = accounts.slice(0, 10).map(a => `| ${a.name} | ${a.status} | ${a.plan || '—'} | ${a.contacts} | ${a.open} |`);
    return `### Resumo executivo — ${agency.company?.name || 'Minha agência'}\n\n- **MRR:** ${fmtMoney(t.mrr)}\n- **Subcontas:** ${t.active} ativas / ${t.accounts} no total (${t.paused} pausadas, ${t.closed} encerradas)\n- **Contatos totais:** ${t.contacts}\n- **Oportunidades abertas:** ${t.open}\n- **Setups de conta:** ${agency.snapshots?.length || 0} | **Equipe:** ${agency.users?.length || 0}\n\n${rows.length ? `| Subconta | Status | Plano | Contatos | Oportunidades |\n|---|---|---|---:|---:|\n${rows.join('\n')}` : ''}`;
  }

  if (/próximo|proximo|passo|recomend|sugest|melhorar|prioridade/.test(q)) {
    const next = [
      !agency.company?.domain && '**Configurar domínio White Label** em *Configurações → Empresa e marca*',
      !agency.snapshots?.length && '**Criar o primeiro setup** a partir da sua melhor subconta em *Setups de conta*',
      !agency.plans?.length && '**Definir planos SaaS** para estruturar cobrança recorrente em *Configurador SaaS → Planos SaaS*',
      !agency.users?.length && '**Convidar sua equipe** em *Configurações → Equipe*',
      !agency.abacatepay?.connected && '**Conectar o AbacatePay** em *Configurações → AbacatePay* para cobrar as assinaturas por Pix ou cartão'
    ].filter(Boolean);
    if (!next.length) {
      return `### Próximos passos recomendados\n\nA estrutura base da sua agência (**marca, setups de conta, planos, equipe e faturamento**) já está configurada.\n\n**Foco sugerido agora:**\n1. Acompanhar subcontas com menos atividade no **Painel da agência**.\n2. Usar **Prospecção** para gerar auditorias e converter novos clientes em subcontas.\n3. Revisar oportunidades abertas (**${t.open}** no total).`;
    }
    return `### Próximos passos recomendados\n\nCom base nos registros atuais da agência, priorize:\n\n${next.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}`;
  }

  // Verifica se a pergunta cita o nome de alguma subconta específica
  const mentioned = accounts.find(a => a.name && q.includes(a.name.toLowerCase()));
  if (mentioned) {
    return `### Detalhes da subconta: ${mentioned.name}\n\n- **Status:** ${mentioned.status}\n- **Plano SaaS:** ${mentioned.plan || 'Sem plano atribuído'}\n- **Contatos:** ${mentioned.contacts}\n- **Oportunidades abertas:** ${mentioned.open}\n- **Último login:** ${mentioned.lastLogin || 'Ainda não registrou acesso'}`;
  }

  return `Aqui está o panorama atual da **${agency.company?.name || 'sua agência'}** com base nos registros locais:\n\n- **MRR:** ${fmtMoney(t.mrr)} em **${t.active}** subconta(s) ativa(s)\n- **Contatos:** ${t.contacts} | **Oportunidades abertas:** ${t.open}\n- **Setups de conta:** ${agency.snapshots?.length || 0} | **Equipe:** ${agency.users?.length || 0}\n\nVocê pode perguntar especificamente sobre **MRR e planos**, **ranking de contatos**, **subcontas sem login**, **setups de conta**, **equipe**, **prospects** ou **próximos passos**.\n\n> **Dica:** conecte sua chave da OpenAI em **Configurações → OpenAI** para conversar livremente com modelos generativos usando todos os dados da agência em tempo real.`;
}

// ---------- Provedor LLM (OpenAI conectada na Graao / env / Assistente local) ----------

async function resolveProvider({ openAI, session, env = process.env, request = fetch }) {
  const userConn = await openAI.optionalConnection(session);
  if (userConn) {
    return createOpenAICompatProvider({
      baseUrl: OPENAI_URL,
      apiKey: userConn.apiKey,
      defaultModel: userConn.model || 'gpt-4.1-mini',
      request: userConn.request || request,
      source: 'openai-account'
    });
  }
  const hasGemini = Boolean(env.GEMINI_API_KEY) && !env.OPENAI_BASE_URL;
  const baseUrl = (env.OPENAI_BASE_URL || (hasGemini ? GEMINI_URL : OPENAI_URL)).replace(/\/+$/, '');
  const apiKey = hasGemini ? env.GEMINI_API_KEY : (env.OPENAI_API_KEY || '');
  if (apiKey || baseUrl !== OPENAI_URL) {
    return createOpenAICompatProvider({
      baseUrl,
      apiKey,
      defaultModel: env.OPENAI_MODEL || (hasGemini ? 'gemini-flash-latest' : 'gpt-4.1-mini'),
      request,
      source: 'env'
    });
  }
  return createLocalProvider();
}

function createOpenAICompatProvider({ baseUrl, apiKey, defaultModel, request, source }) {
  const isOpenAI = baseUrl === OPENAI_URL;
  const headers = () => ({
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
  });

  async function apiFetch(pathname, init) {
    const res = await request(`${baseUrl}${pathname}`, { ...init, headers: headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let detail = body.slice(0, 300);
      try {
        const parsed = JSON.parse(body);
        detail = (Array.isArray(parsed) ? parsed[0] : parsed)?.error?.message || detail;
      } catch {}
      if (res.status === 401 || res.status === 403) throw fail('A chave da API foi recusada. Verifique sua chave em Configurações → OpenAI.', res.status);
      if (res.status === 429) throw fail('Limite de uso ou saldo excedido na API de IA. Verifique sua conta ou tente outro modelo.', 429);
      throw fail(`A API de IA respondeu ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
    }
    return res;
  }

  async function listModels() {
    if (isOpenAI) {
      return [defaultModel, ...DEFAULT_OPENAI_MODELS.filter(m => m !== defaultModel)];
    }
    try {
      const res = await apiFetch('/models', { method: 'GET', signal: AbortSignal.timeout(8000) });
      const ids = ((await res.json()).data || [])
        .map(m => String(m.id || '').replace(/^models\//, ''))
        .filter(id => id && !NON_CHAT.test(id));
      const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
      return defaultModel && !unique.includes(defaultModel) ? [defaultModel, ...unique] : unique;
    } catch {
      return defaultModel ? [defaultModel] : [];
    }
  }

  async function stream({ model, messages, signal, onDelta, onReasoning }) {
    const chosen = model && model !== 'local' ? model : defaultModel;
    const res = await apiFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: chosen, messages, stream: true }),
      signal
    });
    let finish = 'stop';
    for await (const event of readSSELines(res.body)) {
      if (event === '[DONE]') break;
      let json;
      try { json = JSON.parse(event); } catch { continue; }
      if (json.error) throw new Error(json.error.message || 'Erro no stream da API');
      const choice = json.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta || {};
      const reasoning = delta.reasoning_content ?? delta.reasoning;
      if (typeof reasoning === 'string' && reasoning) onReasoning?.(reasoning);
      if (typeof delta.content === 'string' && delta.content) onDelta(delta.content);
      if (choice.finish_reason) finish = choice.finish_reason;
    }
    return { finish, model: chosen };
  }

  async function complete({ model, messages, signal }) {
    const chosen = model && model !== 'local' ? model : defaultModel;
    const res = await apiFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: chosen, messages }),
      signal
    });
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  return { mode: 'live', source, baseUrl, defaultModel, listModels, stream, complete };
}

function createLocalProvider() {
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

  return {
    mode: 'local',
    source: 'local',
    baseUrl: null,
    defaultModel: 'local',
    listModels: async () => ['local'],
    async stream({ agency, overview, userText, attachments, signal, onDelta }) {
      const reply = await localAgencyReply({ prompt: userText, agency, overview, attachments });
      await sleep(160, signal);
      const chunks = reply.match(/\S+\s*|\s+/g) || [reply];
      for (const piece of chunks) {
        onDelta(piece);
        await sleep(8, signal);
      }
      return { finish: 'stop', model: 'local' };
    },
    async complete({ userText }) {
      const clean = String(userText || '').replace(/\s+/g, ' ').trim();
      return clean.split(/\s+/).slice(0, 6).join(' ').slice(0, 60) || DEFAULT_TITLE;
    }
  };
}

async function* readSSELines(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
  if (buffer.startsWith('data:')) yield buffer.slice(5).trim();
}

function buildLLMHistory({ conv, leafId, agency, overview, customInstructions, skills }) {
  const today = new Date().toISOString().slice(0, 10);
  const agencyContext = buildAgencyContext({ agency, overview });

  const activeSkills = (skills || []).filter(s => s.enabled !== false);
  const skillsSection = activeSkills.length > 0 ? `Habilidades especializadas ativas nesta agência (padrão agentskills.io):
${activeSkills.map(s => `### ${s.name}
${s.description ? `*${s.description}*\n` : ''}${s.instructions}`).join('\n\n')}` : '';

  const system = [
    `Você é a Graao, assistente executiva de IA integrada à plataforma de gestão de agências graao. Responda em português do Brasil ou espanhol latino (conforme a preferência ou idioma do usuário), de forma clara, direta, útil e usando Markdown bem estruturado (listas, tabelas, destaques, código quando pertinente). Todas as novas criações, templates, copies ou materiais devem nascer já prontos em português e espanhol latino, com alta qualidade e linguagem natural para ambos os mercados. Data atual: ${today}.`,
    `Dados atuais desta agência (trate como base factual da operação):\n${agencyContext}`,
    skillsSection,
    typeof customInstructions === 'string' && customInstructions.trim()
      ? `Instruções personalizadas do usuário:\n${customInstructions.trim().slice(0, 4000)}`
      : ''
  ].filter(Boolean).join('\n\n');

  const out = [{ role: 'system', content: system }];
  for (const msg of pathMessages(conv, leafId)) {
    const role = msg.author?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const text = messageText(msg);
    const attachments = msg.metadata?.attachments || [];
    const files = attachments.filter(a => a.kind === 'file');
    const images = attachments.filter(a => a.kind === 'image');
    const fullText = [
      text,
      ...files.map(f => `Arquivo anexado: ${f.name}\n\`\`\`\n${f.text}\n\`\`\``)
    ].filter(Boolean).join('\n\n');
    if (role === 'user' && images.length) {
      out.push({
        role,
        content: [
          ...(fullText ? [{ type: 'text', text: fullText }] : []),
          ...images.map(img => ({ type: 'image_url', image_url: { url: img.dataUrl } }))
        ]
      });
    } else if (fullText) {
      out.push({ role, content: fullText });
    }
  }
  return out;
}

async function generateTitle(provider, model, userText, replyText) {
  const fallback = String(userText || '').replace(/\s+/g, ' ').trim().slice(0, 56) || DEFAULT_TITLE;
  if (provider.mode === 'local') return fallback;
  try {
    const raw = await provider.complete({
      model,
      userText,
      signal: AbortSignal.timeout(15000),
      messages: [
        {
          role: 'system',
          content: 'Crie um título curto (no máximo 6 palavras) para esta conversa, no idioma dela. Responda só com o título, sem aspas e sem ponto final.'
        },
        { role: 'user', content: `Usuário: ${String(userText || '').slice(0, 1500)}\n\nAssistente: ${String(replyText || '').slice(0, 1500)}` }
      ]
    });
    const title = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '').split('\n').map(l => l.trim()).find(Boolean) || '';
    return title.replace(/^["'“”*#\s]+|["'“”*.\s]+$/g, '').slice(0, 80) || fallback;
  } catch {
    return fallback;
  }
}

async function readLargeJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw fail('Envie uma requisição JSON.', 415);
  let size = 0;
  const chunks = [];
  for await (const part of req) {
    size += part.length;
    if (size > MAX_ASK_BODY) throw fail('Conteúdo grande demais.', 413);
    chunks.push(part);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!v || typeof v !== 'object') throw new Error();
    return v;
  } catch {
    throw fail('JSON inválido.', 400);
  }
}

function openSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();
  return (event, data) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };
}

// ---------- Router principal para /api/ask/* ----------

export function createAskHandler({ store, openAI, openAIRequest = fetch }) {
  const chatStore = createChatStore(store);

  return async function handleAsk({ req, res, url, method, who, loadContext, json }) {
    let rawPath = url.searchParams.get('__path') || url.pathname;
    if (!rawPath.startsWith('/')) rawPath = '/' + rawPath;
    rawPath = rawPath.replace(/\/+/g, '/');
    const op = rawPath.slice('/api/ask/'.length).replace(/\/+$/, '');
    const agencyId = who.agencyId;

    if (op === 'state' && method === 'GET') {
      const provider = await resolveProvider({ openAI, session: who.session, request: openAIRequest });
      const [models, items, instructions, skills] = await Promise.all([
        provider.listModels(),
        chatStore.list(agencyId),
        chatStore.getInstructions(agencyId),
        chatStore.getSkills(agencyId)
      ]);
      return json({
        config: {
          mode: provider.mode,
          source: provider.source,
          defaultModel: provider.defaultModel,
          models
        },
        items,
        instructions,
        skills
      });
    }

    if (op === 'skills' && method === 'GET') {
      return json({ skills: await chatStore.getSkills(agencyId) });
    }

    if (op === 'skills' && method === 'POST') {
      const body = await readLargeJson(req);
      if (body.action === 'delete') {
        if (!body.id) throw fail('ID da habilidade não informado.', 400);
        return json({ skills: await chatStore.deleteSkill(agencyId, body.id) });
      }
      let skillData = body;
      if (body.rawMarkdown) {
        const parsed = parseSkillMd(body.rawMarkdown);
        skillData = {
          ...parsed,
          ...(body.name ? { name: body.name } : {}),
          id: body.id,
          enabled: body.enabled !== false
        };
      }
      const skills = await chatStore.saveSkill(agencyId, skillData);
      return json({ skills });
    }

    if (op === 'skills' && method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) throw fail('ID da habilidade não informado.', 400);
      return json({ skills: await chatStore.deleteSkill(agencyId, id) });
    }

    if (op === 'settings' && method === 'POST') {
      const body = await readLargeJson(req);
      return json(await chatStore.setInstructions(agencyId, body.instructions));
    }

    if (op === 'conversation' && method === 'GET') {
      const id = url.searchParams.get('id') || '';
      const conv = await chatStore.get(agencyId, id);
      if (!conv) throw fail('Conversa não encontrada.', 404);
      return json(conv);
    }

    if (op === 'search' && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      return json({ items: await chatStore.search(agencyId, q) });
    }

    if (op === 'export' && method === 'GET') {
      const data = await chatStore.exportAll(agencyId);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="graao-conversas.json"',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(data));
      return;
    }

    if (op === 'rename' && method === 'POST') {
      const body = await readLargeJson(req);
      return json(await chatStore.rename(agencyId, String(body.id || ''), body.title));
    }

    if (op === 'branch' && method === 'POST') {
      const body = await readLargeJson(req);
      return json(await chatStore.setBranch(agencyId, String(body.id || ''), String(body.current_node || '')));
    }

    if (op === 'feedback' && method === 'POST') {
      const body = await readLargeJson(req);
      return json(await chatStore.setFeedback(agencyId, String(body.id || ''), String(body.messageId || ''), body.rating));
    }

    if (op === 'delete' && method === 'POST') {
      const body = await readLargeJson(req);
      return json(await chatStore.remove(agencyId, String(body.id || '')));
    }

    if (op === 'delete-all' && method === 'POST') {
      return json(await chatStore.removeAll(agencyId));
    }

    if (op === 'import' && method === 'POST') {
      const body = await readLargeJson(req);
      const list = Array.isArray(body) ? body : body?.conversations;
      const imported = await chatStore.importList(agencyId, list);
      return json({ imported });
    }

    if (op === 'conversation' && method === 'POST') {
      const body = await readLargeJson(req);
      const action = body.action === 'variant' ? 'variant' : 'next';
      const provider = await resolveProvider({ openAI, session: who.session, request: openAIRequest });

      let conv;
      if (body.conversation_id) {
        conv = await chatStore.get(agencyId, String(body.conversation_id));
        if (!conv) throw fail('Conversa não encontrada.', 404);
      } else {
        conv = createConv({ temporary: Boolean(body.temporary) });
      }

      const model = String(body.model || provider.defaultModel || 'local');
      let parent;
      if (action === 'next') {
        const parentId = body.parent_message_id && conv.mapping[body.parent_message_id]
          ? body.parent_message_id
          : rootId(conv);
        const user = sanitizeUserMessage(body.messages?.[0], conv);
        if (!user) throw fail('Mensagem vazia.', 400);
        addMessageToConv(conv, parentId, user);
        parent = user;
      } else {
        parent = conv.mapping[body.parent_message_id]?.message;
        if (parent?.author?.role !== 'user') throw fail('Mensagem a regenerar não encontrada.', 400);
        conv.current_node = parent.id;
      }

      await chatStore.save(agencyId, conv);
      const { agency, overview } = await loadContext();

      const emit = openSSE(res);
      const assistantId = randomUUID();
      emit('meta', { conversation: conv, user_message_id: parent.id, assistant_message_id: assistantId });

      const controller = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) controller.abort();
      });

      let text = '';
      let reasoning = '';
      let finish = 'stop';
      let failure = null;
      let answeredBy = model;
      const started = Date.now();
      const userText = messageText(parent);
      const attachments = parent.metadata?.attachments || [];

      try {
        const [storedInstructions, skills] = await Promise.all([
          typeof body.system_prompt === 'string' ? body.system_prompt : chatStore.getInstructions(agencyId),
          chatStore.getSkills(agencyId)
        ]);
        const history = buildLLMHistory({
          conv,
          leafId: parent.id,
          agency,
          overview,
          customInstructions: storedInstructions,
          skills
        });
        const result = await provider.stream({
          model,
          messages: history,
          agency,
          overview,
          userText,
          attachments,
          signal: controller.signal,
          onDelta: v => {
            text += v;
            emit('delta', { v });
          },
          onReasoning: v => {
            reasoning += v;
            emit('reasoning', { v });
          }
        });
        finish = result.finish || 'stop';
        if (result.model) answeredBy = result.model;
      } catch (err) {
        if (controller.signal.aborted || err.name === 'AbortError') finish = 'interrupted';
        else failure = err;
      }

      let assistant = null;
      if (text || reasoning) {
        assistant = {
          id: assistantId,
          author: { role: 'assistant' },
          content: { content_type: 'text', parts: [text] },
          create_time: nowSec(),
          metadata: {
            model_slug: answeredBy,
            finish_details: { type: finish },
            ...(reasoning ? { reasoning, reasoning_ms: Date.now() - started } : {})
          }
        };
        addMessageToConv(conv, parent.id, assistant);
        await chatStore.save(agencyId, conv);
      }

      if (controller.signal.aborted) return;

      if (failure) {
        emit('error', { message: failure.message || 'Não foi possível gerar uma resposta.', assistant_message: assistant });
        res.end();
        return;
      }

      emit('done', { message: assistant });

      if (conv.title === DEFAULT_TITLE && assistant) {
        const title = await generateTitle(provider, answeredBy, userText || attachments[0]?.name || DEFAULT_TITLE, text);
        conv.title = title;
        conv.update_time = nowSec();
        await chatStore.save(agencyId, conv);
        emit('title', { conversation_id: conv.id, title: conv.title });
      }
      res.end();
      return;
    }

    throw fail('Rota não encontrada.', 404);
  };
}
