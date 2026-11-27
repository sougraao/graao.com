// Template de setup "Funil de Reuniões Qualificadas" (Setups de conta → Templates de setup): vídeo de apresentação, formulário que qualifica, agenda curta e página de
// confirmação que prepara o lead para a reunião. Quem não tem o perfil vai para uma oferta menor, sem contar como Lead.
import { newSiteDoc } from './studio-site.mjs';
import { newField } from './ui/form-fields.js';

const SITE = 'site-frq', FORM = 'fm-frq-qualificacao', START = 'fm-frq-inicial', SERVICE = 'sv-frq-reuniao';

/* ───────── Páginas ───────── */

const css = `*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:#f3f5f6;color:#10212b;font:17px/1.6 "Figtree",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3,p,ul,ol{margin:0}h1,h2,h3{font-family:"Schibsted Grotesk",system-ui,sans-serif;font-weight:700;letter-spacing:-.025em;line-height:1.08;text-wrap:balance}
h1{font-size:clamp(34px,5vw,62px)}h2{font-size:clamp(26px,3.2vw,40px)}h3{font-size:19px;letter-spacing:-.015em;line-height:1.25}
.wrap{width:min(1080px,100% - 40px);margin-inline:auto}.narrow{width:min(760px,100% - 40px)}
.top{background:#0d1c25;color:#eef3f5;padding:clamp(40px,6vw,72px) 0 clamp(150px,20vw,260px)}
.top .wrap{display:grid;gap:20px;justify-items:center;text-align:center}.top p{max-width:60ch;color:#b7c7cf;font-size:19px}
.stage{margin-top:calc(-1*clamp(120px,17vw,220px))}
.video{background:#17303d;color:#c9d7de;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px -24px rgba(13,28,37,.55)}
.ph{display:grid;place-items:center;width:100%;aspect-ratio:16/9;min-height:180px;padding:24px;text-align:center;border-radius:inherit;background:#17303d;color:#c9d7de}
.slot{display:grid;place-items:center;width:100%;min-height:220px;padding:24px;text-align:center;border:1px dashed #a9bac3;border-radius:12px;color:#4a616d}
.sec{padding:clamp(56px,8vw,104px) 0}.sec+.sec{padding-top:0}.head{display:grid;gap:12px;margin-bottom:32px}.head p{max-width:62ch;color:#45596a}
.card{background:#fff;border-radius:18px;padding:clamp(22px,4vw,44px);box-shadow:0 1px 2px rgba(16,33,43,.08)}
.btn{display:inline-block;background:#d8431f;color:#fff;font-weight:600;text-decoration:none;padding:15px 28px;border-radius:12px}.btn:hover{background:#bb3715}.btn:focus-visible{outline:3px solid #10212b;outline-offset:3px}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:48px}.two ul{padding:0;list-style:none;display:grid;gap:14px}.two li{padding-top:14px;border-top:1px solid #cdd8dd}.two h3{margin-bottom:18px}
.steps{counter-reset:n;padding:0;list-style:none;display:grid}.steps li{counter-increment:n;display:grid;grid-template-columns:56px 1fr;gap:4px 12px;padding:22px 0;border-top:1px solid #cdd8dd}.steps li::before{content:counter(n);font:700 26px/1.1 "Schibsted Grotesk",sans-serif;color:#d8431f;grid-row:span 2}.steps p{color:#45596a}
.videos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:36px 28px}.videos article{display:grid;gap:14px;align-content:start}.videos p{color:#45596a;font-size:16px}
footer{padding:32px 0 48px;text-align:center;color:#5b707c;font-size:14px}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;

const page = (title, body) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600&family=Schibsted+Grotesk:wght@700&display=swap">
<style>${css}</style></head><body>${body}<footer><div class="wrap">Seus dados são usados só para falar com você sobre este atendimento.</div></footer></body></html>`;
const video = label => `<div class="video"><div data-graao-embed="video" class="ph"><span>${label}</span></div></div>`;
const form = (id, label) => `<div data-graao-embed="form" data-id="${id}" class="slot"><span>${label}</span></div>`;
const booking = `<div data-graao-embed="booking" data-id="${SERVICE}" class="slot"><span>Agenda: Reunião de diagnóstico</span></div>`;

const answers = [
  ['Como funciona o trabalho', 'O passo a passo, do primeiro dia até a entrega.'],
  ['Para quem é e para quem não é', 'Os sinais de que faz sentido seguir, e os de que ainda não é a hora.'],
  ['Qual é o investimento', 'O que está incluído e como são as formas de pagamento.'],
  ['Como funciona a garantia', 'O que acontece se o combinado não for entregue.'],
  ['Em quanto tempo aparece resultado', 'O que esperar das primeiras semanas e o que leva mais tempo.'],
  ['O que muda em relação a outros fornecedores', 'O que fazemos de um jeito diferente, e por quê.']
];

const pages = [
  { name: 'Vídeo e formulário', slug: 'index', html: page('Assista antes de falar com a gente', `
<section class="top"><div class="wrap"><h1>Em dez minutos você entende como trabalhamos e se faz sentido para a sua empresa</h1>
<p>O vídeo mostra o problema que resolvemos, o método, o investimento e a garantia. Quem assiste chega à reunião sabendo o que perguntar.</p></div></section>
<main><div class="wrap stage">${video('Vídeo de apresentação: cole o link no painel Design')}</div>
<section class="sec"><div class="wrap narrow"><div class="head"><h2>Gostou do que viu? Conte sobre a sua empresa</h2><p>São oito perguntas rápidas. Se o perfil combinar, a agenda abre em seguida.</p></div><div class="card" id="formulario">${form(FORM, 'Formulário: Qualificação para reunião')}</div></div></section>
<section class="sec"><div class="wrap two"><div><h3>A reunião é para quem</h3><ul><li>Decide, ou participa da decisão, na empresa.</li><li>Tem um problema claro e quer resolver agora.</li><li>Pode fazer o investimento explicado no vídeo.</li></ul></div>
<div><h3>Ainda não é para quem</h3><ul><li>Só quer comparar preços.</li><li>Não tem tempo para participar das primeiras semanas.</li><li>Espera resultado sem mudar nada no que já faz.</li></ul></div></div></section>
<section class="sec"><div class="wrap"><a class="btn" href="#formulario">Responder às perguntas</a></div></section></main>`) },
  { name: 'Agenda', slug: 'agenda', html: page('Escolha o horário da reunião', `
<section class="top"><div class="wrap"><h1>Seu perfil combina. Escolha o horário da reunião</h1><p>A agenda fica aberta só para os próximos dias, com tempo para a gente se preparar e para você ver os vídeos que vêm a seguir.</p></div></section>
<main><div class="wrap narrow stage"><div class="card">${booking}</div></div>
<section class="sec"><div class="wrap narrow"><ol class="steps"><li><h3>Antes</h3><p>Depois de agendar, você vê uma página com respostas para as dúvidas mais comuns.</p></li><li><h3>Durante</h3><p>São 45 minutos sobre a sua empresa: o momento, o desafio e o que já foi tentado.</p></li><li><h3>Depois</h3><p>Você sai com um plano do próximo passo, com ou sem a nossa ajuda.</p></li></ol></div></section></main>`) },
  { name: 'Confirmação', slug: 'confirmacao', html: page('Reunião marcada', `
<section class="top"><div class="wrap"><h1>Reunião marcada. Veja o que fazer agora</h1><p>Comece por este vídeo. Ele mostra como a reunião funciona e o que deixar separado.</p></div></section>
<main><div class="wrap stage">${video('Vídeo de boas-vindas, de 3 a 5 minutos: cole o link no painel Design')}</div>
<section class="sec"><div class="wrap narrow"><ol class="steps"><li><h3>Salve o horário na sua agenda</h3><p>A confirmação chega pelo contato que você informou.</p></li><li><h3>Assista às respostas abaixo</h3><p>Com elas, usamos a reunião para falar da sua empresa, e não da nossa.</p></li><li><h3>Atenda a nossa ligação</h3><p>Vamos confirmar o horário e tirar qualquer dúvida antes.</p></li></ol></div></section>
<section class="sec"><div class="wrap"><div class="head"><h2>O que costumam perguntar antes da reunião</h2><p>Vídeos curtos, de dois a três minutos cada.</p></div><div class="videos">${answers.map(([title, text]) => `<article>${video(`Vídeo: ${title.toLowerCase()}`)}<h3>${title}</h3><p>${text}</p></article>`).join('')}</div></div></section></main>`) },
  { name: 'Oferta inicial', slug: 'proximo-passo', html: page('Um bom começo para o seu momento', `
<section class="top"><div class="wrap"><h1>A reunião pode esperar. Comece por um passo menor</h1><p>Pelo que você contou, este ainda não é o momento da reunião. Há um caminho mais simples, que já ajuda agora.</p></div></section>
<main><div class="wrap stage">${video('Vídeo da oferta inicial: cole o link no painel Design')}</div>
<section class="sec"><div class="wrap two"><div class="head"><h2>Quero saber mais</h2><p>Deixe o seu contato e enviamos o que está incluído, o valor e como começar.</p></div><div class="card">${form(START, 'Formulário: Interesse na oferta inicial')}</div></div></section></main>`) }
];

/* ───────── Formulários ───────── */

const field = (id, type, extra) => ({ ...newField(type, extra), id, hidden: false, width: 100, ...extra });
const base = { description: '', askPhone: true, active: true, kind: 'form', accent: '#d8431f', showTitle: false, schedule: { start: '', end: '', closedMessage: '' } };
const dest = extra => ({ action: 'default', message: '', url: '', siteId: '', page: '', serviceId: '', ...extra });
const forms = [
  { ...base, id: FORM, name: 'Qualificação para reunião', button: 'Ver horários', addTags: ['funil-reunioes'],
    fields: [
      field('frq-nome', 'name', { label: 'Seu nome', required: true }), field('frq-email', 'email', { label: 'E-mail', required: true, width: 50 }), field('frq-fone', 'phone', { label: 'WhatsApp', required: true, width: 50 }),
      field('frq-empresa', 'organization', { label: 'Nome da empresa', required: true, width: 50 }), field('frq-site', 'text', { label: 'Site ou Instagram da empresa', key: 'site_ou_instagram', width: 50 }),
      field('frq-cargo', 'select', { label: 'Qual é o seu papel na empresa?', key: 'papel', required: true, options: ['Sou dono(a) ou sócio(a)', 'Sou gestor(a) e participo da decisão', 'Não participo da decisão'] }),
      field('frq-desafio', 'textarea', { label: 'Qual é o principal desafio da empresa hoje?', key: 'desafio', required: true, help: 'Quanto mais detalhes, mais útil fica a reunião.' }),
      field('frq-investe', 'radio', { label: 'O investimento foi explicado no vídeo. Se fizer sentido, a empresa consegue investir agora?', key: 'investimento', required: true, options: ['Sim', 'Não'] })
    ],
    onSubmit: dest({ action: 'page', siteId: SITE, page: 'agenda' }),
    routes: [
      { when: 'answer', fieldId: 'frq-investe', option: 'Não', disqualify: true, tag: 'lead-desqualificado', dest: dest({ action: 'page', siteId: SITE, page: 'proximo-passo' }) },
      { when: 'answer', fieldId: 'frq-cargo', option: 'Não participo da decisão', disqualify: true, tag: 'nao-decide', dest: dest({ action: 'page', siteId: SITE, page: 'proximo-passo' }) },
      { when: 'answer', fieldId: 'frq-investe', option: 'Sim', disqualify: false, tag: 'pode-investir', dest: dest() }
    ] },
  { ...base, id: START, name: 'Interesse na oferta inicial', button: 'Quero receber', addTags: ['oferta-inicial'],
    fields: [field('fri-nome', 'name', { label: 'Seu nome', required: true }), field('fri-email', 'email', { label: 'E-mail', required: true }), field('fri-fone', 'phone', { label: 'WhatsApp' })],
    onSubmit: dest({ action: 'message', message: 'Pronto. Enviamos os detalhes para o seu e-mail ou WhatsApp.' }), routes: [] }
];

/* ───────── Pipeline e fluxos ───────── */

const stage = (id, name) => ({ id: `st-frq-${id}`, pipelineId: 'pl-frq', name });
const stages = [stage('qualificado', 'Qualificado, sem horário'), stage('agendada', 'Reunião agendada'), stage('realizada', 'Reunião realizada'), stage('proposta', 'Proposta enviada'),
  stage('fechado', 'Fechado'), stage('faltou', 'Cancelou ou faltou'), stage('inicial', 'Oferta inicial')];
let step = 0;
const s = (type, config, extra = {}) => ({ id: `frq-step-${++step}`, type, config, ...extra });
const trigger = (type, config) => ({ id: `frq-trig-${++step}`, type, config });
const workflow = (id, name, triggers, steps) => ({ id, name, folderId: 'wfo-frq', active: false, allowReentry: true, triggers, steps });
const moveTo = name => s('create_opportunity', { title: '{{contact.name}}', stageId: `st-frq-${name}`, value: 0 });
const workflows = [
  workflow('wf-frq-1', '1. Lead qualificado sem horário', [trigger('form_submitted', { formId: FORM, qualified: 'yes' })], [
    moveTo('qualificado'), s('create_task', { title: 'Ligar para {{contact.name}} e validar o perfil', dueDays: 1, owner: '' }),
    s('wait', { mode: 'event', event: 'appointment_booked', eventValue: '', timeoutDays: 1 }),
    s('if_else', { match: 'all', conditions: [{ subject: 'tag', op: 'not_has', value: 'reuniao-agendada' }] }, {
      yes: [s('send_whatsapp', { body: 'Oi, {{contact.first_name}}! Vi que você respondeu às perguntas, mas ainda não escolheu o horário da reunião. Quer ajuda para encontrar um?' })], no: [] })
  ]),
  workflow('wf-frq-2', '2. Lead desqualificado', [trigger('form_submitted', { formId: FORM, qualified: 'no' })], [
    moveTo('inicial'), s('wait', { mode: 'delay', amount: 1, unit: 'days' }),
    s('send_email', { subject: 'Um passo menor para começar', body: 'Oi, {{contact.first_name}}!\n\nObrigado por contar sobre a sua empresa. Pelo que você respondeu, o melhor agora é um passo menor, que já resolve parte do problema e cabe no seu momento.\n\nResponda a este e-mail e envio o que está incluído, o valor e como começar.' })
  ]),
  workflow('wf-frq-3', '3. Reunião agendada: preparo e lembretes', [trigger('service_booked', { serviceId: SERVICE, kind: '' })], [
    s('add_tag', { tag: 'reuniao-agendada' }), moveTo('agendada'),
    s('send_whatsapp', { body: 'Reunião confirmada, {{contact.first_name}}: {{vars.evento_dia}}, às {{vars.evento_hora}}. Antes dela, assista aos vídeos da página de confirmação: eles respondem às dúvidas mais comuns e deixam a nossa conversa mais útil.' }),
    s('create_task', { title: 'Confirmar a reunião com {{contact.name}} por telefone e pedir que assista aos vídeos', dueDays: 1, owner: '' }),
    s('wait', { mode: 'event_date', offset: 24, offsetUnit: 'hours', direction: 'before' }),
    s('send_whatsapp', { body: 'Oi, {{contact.first_name}}! Nossa reunião é {{vars.evento_dia}}, às {{vars.evento_hora}}. Conseguiu ver os vídeos? Se precisar remarcar, é só responder por aqui.' }),
    s('wait', { mode: 'event_date', offset: 1, offsetUnit: 'hours', direction: 'before' }),
    s('send_whatsapp', { body: '{{contact.first_name}}, nos vemos em uma hora, às {{vars.evento_hora}}.' })
  ]),
  workflow('wf-frq-4', '4. Cancelou ou faltou', [trigger('appointment_status', { status: 'Canceled' })], [
    s('remove_from_workflow', { workflowId: 'wf-frq-3' }), s('remove_tag', { tag: 'reuniao-agendada' }), moveTo('faltou'),
    s('wait', { mode: 'delay', amount: 2, unit: 'hours' }),
    s('send_whatsapp', { body: 'Oi, {{contact.first_name}}! A nossa reunião não aconteceu. Quer escolher outro horário? Respondo por aqui com as opções.' }),
    s('create_task', { title: 'Remarcar a reunião com {{contact.name}}', dueDays: 1, owner: '' })
  ]),
  workflow('wf-frq-5', '5. Reunião realizada', [trigger('appointment_status', { status: 'Completed' })], [
    moveTo('realizada'), s('create_task', { title: 'Enviar a proposta para {{contact.name}}', dueDays: 1, owner: '' })
  ])
];

/* ───────── Roteiros (mensagens prontas) ───────── */

const snippets = [
  ['Roteiro do vídeo de apresentação (8 a 12 min)', `1. Primeiro minuto: resuma o vídeo inteiro. O que você resolve, para quem e o que a pessoa vai saber no fim.
2. O problema: descreva a situação do cliente com as palavras dele.
3. O que você faz: o método, em três ou quatro etapas.
4. Por que você: um caso real, com a situação antes, o que foi feito e o resultado. Só use números que você pode comprovar.
5. A oferta: quanto custa trabalhar com você. Se o valor muda por cliente, diga o que é preciso ter para começar.
6. A garantia e as condições.
7. As objeções: responda às cinco perguntas que mais aparecem nas reuniões.
8. Para quem é e para quem não é.
9. A chamada: responder às perguntas abaixo do vídeo.`],
  ['Roteiro do vídeo de confirmação (3 a 5 min)', `1. Agradeça e confirme o que acabou de acontecer: a reunião está marcada.
2. Reforce o problema e o método em uma frase cada.
3. Explique como a reunião funciona: duração, quem participa e o que vão decidir.
4. Diga o que deixar separado.
5. Peça que assista aos vídeos da página antes do horário.`],
  ['Ligação de confirmação', `Oi, {{contact.first_name}}, tudo bem? Aqui é da equipe. Estou ligando para confirmar a nossa reunião.
Vi que o seu principal desafio hoje é o que você escreveu no formulário. Pode me contar um pouco mais?
Antes da reunião, peço que você veja os vídeos da página de confirmação. Com eles, usamos o tempo para falar da sua empresa. Combinado?`]
].map(([name, body], index) => ({ id: `sn-frq-${index + 1}`, folderId: 'sf-frq', type: 'Text', name, subject: '', body }));

/* ───────── Setup ───────── */

const project = { id: SITE, name: 'Funil de Reuniões Qualificadas', headline: 'Funil de Reuniões Qualificadas', summary: 'Vídeo, formulário, agenda, confirmação e oferta inicial.', brief: 'Funil de reuniões qualificadas.',
  template: 'landing', theme: 'indigo', kind: 'funnel', blocks: [], design: null, reference: '', formId: FORM, publishedAt: '', publishedRev: 0, rev: 1, starred: false,
  pages: pages.map(({ name, slug }, index) => ({ id: `pg-frq-${index + 1}`, name, slug })) };

export const funilReunioesSpec = {
  id: 'template-funil-reunioes-qualificadas', template: true, segment: 'agency',
  title: 'Funil de Reuniões Qualificadas',
  summary: 'Do anúncio à reunião marcada: vídeo de apresentação, formulário que qualifica, agenda curta e confirmação que prepara o lead.',
  description: 'Para quem vende serviço de valor mais alto em reunião individual. O visitante assiste ao vídeo, responde ao formulário e só vê a agenda se tiver o perfil: os dados dele já chegam preenchidos. Quem não pode investir ou não decide vai para uma oferta inicial, e o pixel só conta o lead qualificado. A agenda pede 18 horas de antecedência e abre por 4 dias, e a página de confirmação responde às objeções antes da conversa. Vem com 4 páginas prontas para receber os seus vídeos, 2 formulários, pipeline, 5 fluxos desligados (inclusive lembretes contados a partir da reunião) e os roteiros dos vídeos. Depois de criar a subconta: ligue a página de agendamento em Calendários, cole os links dos vídeos, publique o funil e ligue os fluxos.',
  category: 'Agências e Marketing',
  tags: ['funil', 'reuniões', 'qualificação', 'agenda', 'vídeo'],
  publishedAt: '2026-11-24T12:00:00.000Z',
  assets: {
    tags: ['funil-reunioes', 'lead-desqualificado', 'nao-decide', 'pode-investir', 'oferta-inicial', 'reuniao-agendada'].map(name => ({ id: `tg-frq-${name}`, name, description: '', category: 'Funil de reuniões' })),
    pipelines: [{ id: 'pl-frq', name: 'Reuniões qualificadas' }],
    stages,
    forms,
    services: [{ id: SERVICE, name: 'Reunião de diagnóstico', description: 'Conversa de 45 minutos sobre o momento da empresa e o próximo passo.', kind: 'appointment', duration: 45, buffer: 15, price: 0, staffIds: [], resourceIds: [], rentalUnit: '', maxUnits: 1,
      leadMinutes: 1080, horizonDays: 4, after: dest({ action: 'page', siteId: SITE, page: 'confirmacao' }), active: true, color: '#d8431f' }],
    workflowFolders: [{ id: 'wfo-frq', name: 'Funil de reuniões' }],
    workflows,
    snippetFolders: [{ id: 'sf-frq', name: 'Funil de reuniões: roteiros' }],
    snippets,
    studioProjects: [project]
  },
  studioSites: { [SITE]: newSiteDoc({ workspace: '', project, pages }) }
};
