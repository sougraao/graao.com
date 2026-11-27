import { icon } from './icons.js';
import { setupCategories, setupProgress, setupTasks } from './launchpad-data.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const progress = (value, label) => `<div class="lp-progress"><progress max="100" value="${value}" aria-label="${h(label)}">${value}%</progress><span>${value}%</span></div>`;

export function launchpad(c) {
  const tasks = setupTasks(c.s, c.access, c.wa);
  const categories = setupCategories.filter(([key]) => tasks.some(task => task.categories.includes(key)));
  const category = categories.find(([key]) => key === c.tab) || categories[0];
  const total = setupProgress(tasks);
  const name = (c.access?.session?.name || '').trim().split(/\s+/)[0];
  if (!category) return `<div class="page lp-page"><header class="page-head"><div><h1>Guia de configuração</h1><p>Nenhuma tarefa disponível para os seus módulos atuais.</p></div></header><div class="surface padded"><p>Você pode acessar as ferramentas liberadas pelo menu. Para configurar outros recursos, fale com a sua agência.</p></div></div>`;
  const selected = tasks.filter(task => task.categories.includes(category[0]));
  const current = setupProgress(selected);
  const next = selected.find(task => task.percent < 100)?.id || selected[0].id;
  return `<div class="page lp-page">
    <header class="page-head"><div><h1>Guia de configuração</h1><p>${name ? `Olá, ${h(name)}. ` : 'Boas-vindas ao Graao. '}Tudo o que você precisa para começar, um passo de cada vez.</p></div><a class="secondary" href="${c.access?.modules && !c.access.modules.includes('dashboard') ? '#' + tasks[0].modules[0] : '#dashboard'}">Ir para o workspace ${icon('arrow', 16)}</a></header>
    <div class="lp-layout"><aside class="lp-aside"><nav aria-label="Categorias de configuração">${categories.map(([key, label, ico]) => {
      const p = setupProgress(tasks.filter(task => task.categories.includes(key)));
      return `<a href="#launchpad/${key}" class="lp-category ${key === category[0] ? 'selected' : ''}" ${key === category[0] ? 'aria-current="page"' : ''}>${icon(ico, 19)}<span>${h(label)}</span><small aria-label="${p.done} de ${tasks.filter(task => task.categories.includes(key)).length} tarefas concluídas">${p.done}/${tasks.filter(task => task.categories.includes(key)).length}</small></a>`;
    }).join('')}</nav><div class="lp-overall"><strong>Seu workspace está tomando forma</strong><p>${total.done} de ${tasks.length} tarefas concluídas</p>${progress(total.percent, 'Progresso geral da configuração')}<small>O progresso acompanha as configurações salvas nesta subconta.</small></div></aside>
    <section class="lp-content" aria-labelledby="lp-category-title"><div class="lp-section-head"><div><h2 id="lp-category-title">${h(category[1])}</h2><p>${current.done} de ${selected.length} tarefas concluídas</p></div><span class="lp-step-count">${current.completed}/${current.total} etapas</span></div>${progress(current.percent, `Progresso de ${category[1]}`)}
    ${current.percent === 100 ? `<div class="lp-complete" role="status">${icon('check', 20)}<div><strong>Esta parte está pronta.</strong><p>Explore outra categoria ou continue trabalhando na sua subconta.</p></div></div>` : ''}
    <div class="lp-tasks">${selected.map(task => `<details class="lp-task ${task.percent === 100 ? 'is-done' : ''}" ${task.id === next ? 'open' : ''}><summary><span class="lp-task-icon">${icon(task.percent === 100 ? 'check' : task.icon, 20)}</span><span class="lp-task-copy"><strong>${h(task.title)}</strong><span>${h(task.description)}</span></span><span class="lp-task-percent" aria-label="${task.percent}% concluído">${task.percent === 100 ? icon('check', 16) : `${task.percent}%`}</span><span class="lp-chevron">${icon('chevron', 16)}</span></summary><div class="lp-task-body"><ul class="lp-checklist">${task.steps.map(step => `<li class="${step.done ? 'done' : ''}"><span class="lp-check" aria-hidden="true">${step.done ? icon('check', 13) : ''}</span><a href="${h(step.href)}" data-launchpad-start="${category[0]}">${h(step.label)}</a><small>${step.done ? 'Concluída' : 'Pendente'}</small></li>`).join('')}</ul><div class="lp-task-actions"><a class="primary" href="${h(task.href)}" data-launchpad-start="${category[0]}">${task.percent === 100 ? 'Abrir recurso' : task.percent > 0 ? 'Continuar configuração' : 'Começar'} ${icon('arrow', 15)}</a><button class="secondary" data-launchpad-help="${task.id}">${icon('play', 15)} Ver passo a passo</button></div></div></details>`).join('')}</div>
    <p class="lp-footnote">Pode fazer no seu ritmo. Ao voltar, o guia reconhece o que já foi configurado.</p></section></div></div>`;
}

export function launchpadGuide(c, id) {
  const task = setupTasks(c.s, c.access, c.wa).find(task => task.id === id);
  if (!task) return null;
  return { title: task.title, body: `<div class="lp-guide"><p>${h(task.description)}</p><ol>${task.instructions.map(text => `<li>${h(text)}</li>`).join('')}</ol><p class="dim">A conclusão é verificada pelas configurações salvas no workspace.</p><a class="primary" href="${h(task.href)}" data-launchpad-start="${task.categories.includes(c.tab) ? c.tab : task.categories[0]}">Abrir configuração ${icon('arrow', 16)}</a></div>` };
}
