// Preenche o app graao LOCAL com a "Agência Demo": 3 subcontas fictícias usadas nos prints da documentação.
// Nunca rode contra a produção: os dados são inventados e os e-mails usam o domínio reservado exemplo.test.
//
//   npm --prefix docs-site run demo      (sobe o app local sem login, com banco próprio em docs-site/.midia/demo.sqlite)
//   npm --prefix docs-site run semear    (este script; rodar de novo não duplica nada)
import { fileURLToPath } from 'node:url';

const NOMES = ['Ana Beatriz Souza', 'Bruno Carvalho', 'Camila Ribeiro', 'Diego Almeida', 'Eduarda Nunes', 'Felipe Moreira', 'Gabriela Pires',
  'Henrique Teixeira', 'Isabela Duarte', 'João Pedro Lima', 'Karina Mendes', 'Lucas Fernandes', 'Mariana Castro', 'Natália Rocha', 'Otávio Barbosa'];

export const SUBCONTAS = [
  { nome: 'Clínica Sorriso Leve', email: 'contato@sorrisoleve.exemplo.test', tags: ['Paciente', 'Avaliação', 'Retorno'],
    negocios: ['Clareamento', 'Aparelho invisível', 'Implante', 'Limpeza semestral', 'Lentes de contato dental', 'Avaliação completa'] },
  { nome: 'Imobiliária Horizonte', email: 'contato@horizonte.exemplo.test', tags: ['Comprador', 'Locatário', 'Proprietário'],
    negocios: ['Apartamento 2 quartos · Centro', 'Casa com quintal · Jardim', 'Sala comercial · Avenida', 'Cobertura · Vista mar', 'Studio mobiliado', 'Terreno · Condomínio'] },
  { nome: 'Academia Pulso Forte', email: 'contato@pulsoforte.exemplo.test', tags: ['Aluno', 'Aula experimental', 'Plano anual'],
    negocios: ['Plano anual', 'Personal trainer', 'Plano trimestral', 'Pilates', 'Avaliação física', 'Plano família'] },
];

const ETAPAS = ['new', 'qualified', 'proposal', 'proposal', 'won', 'new'];
const MENSAGENS = ['Oi! Vi o anúncio de vocês e queria saber os valores.', 'Consigo marcar um horário para esta semana?', 'Obrigado pelo retorno, vou analisar e respondo amanhã.'];

const email = nome => `${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '.')}@exemplo.test`;

async function pedir(base, caminho, corpo) {
  const resposta = await fetch(`${base}${caminho}`, corpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`${caminho}: ${resposta.status} ${dados.error || ''}`.trim());
  return dados;
}

async function preencher(base, workspace, subconta) {
  const salvar = async (key, data) => (await pedir(base, `/api/action?workspace=${workspace}`, { type: 'save', key, data })).id;
  const contatos = [];
  for (const [i, nome] of NOMES.entries()) {
    const numero = String(i + 1).padStart(2, '0');
    contatos.push(await salvar('contacts', { name: nome, email: email(nome), phone: `+55 11 90000-00${numero}`, tags: [subconta.tags[i % subconta.tags.length]], notes: '' }));
  }
  for (const [i, titulo] of subconta.negocios.entries()) {
    const etapa = ETAPAS[i];
    await salvar('opportunities', { title: titulo, contactId: contatos[i], stage: etapa, value: 900 + i * 650, status: etapa === 'won' ? 'Won' : 'Open' });
  }
  for (const [i, corpo] of MENSAGENS.entries()) {
    // Mensagens recebidas: o graao só registra, não envia nada.
    await pedir(base, `/api/action?workspace=${workspace}`, { type: 'message', data: { contactId: contatos[i], body: corpo, direction: 'Inbound', channel: 'WhatsApp' } });
  }
  await salvar('tasks', { title: `Ligar para ${NOMES[1]}`, contactId: contatos[1], due: '', done: false });
  await salvar('tasks', { title: 'Enviar proposta revisada', contactId: contatos[2], due: '', done: false });
}

export async function semear({ base }) {
  // A agência local nasce como "My Agency": nos prints ela é a Agência Demo, com a cor do graao.
  const { company } = (await pedir(base, '/api/agency')).agency || {};
  if (!company || company.name !== 'Agência Demo') {
    await pedir(base, '/api/agency/action', { type: 'company', data: { name: 'Agência Demo', domain: '', website: '', phone: '+55 11 4000-0000', address: 'São Paulo, SP', primary: '#ff6b1a', secondary: '#c2410c', timezone: 'America/Sao_Paulo' } });
  }
  const { workspaces } = await pedir(base, '/api/workspaces');
  // O app local cria sozinho a subconta "Demo Workspace", com nome em inglês: nos prints ela aparece como mais uma cliente.
  if (workspaces.some(w => w.id === 'demo' && w.name === 'Demo Workspace')) {
    await pedir(base, '/api/action?workspace=demo', { type: 'profile', data: { name: 'Consultoria Norte', email: 'contato@consultorianorte.exemplo.test', phone: '', timezone: 'America/Sao_Paulo' } });
  }
  for (const subconta of SUBCONTAS) {
    if (workspaces.some(w => w.name === subconta.nome)) continue;
    const { id } = await pedir(base, '/api/workspaces', { name: subconta.nome, email: subconta.email, phone: '+55 11 4000-0000', timezone: 'America/Sao_Paulo' });
    await preencher(base, id, subconta);
  }
  const depois = (await pedir(base, '/api/workspaces')).workspaces;
  return { subcontas: SUBCONTAS.filter(s => depois.some(w => w.name === s.nome)).length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = process.argv[2] || 'http://127.0.0.1:4317';
  console.log(await semear({ base }));
}
