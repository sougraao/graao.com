// graao — página inicial pública: menu do celular e abas da jornada.
(() => {
  const menuBtn = document.getElementById('menu-btn');
  const links = document.getElementById('nav-links');

  const setMenu = open => {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.querySelector('.sr').textContent = open ? 'Fechar o menu' : 'Abrir o menu';
    links.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && links.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
  });
  window.matchMedia('(min-width: 961px)').addEventListener('change', event => { if (event.matches) setMenu(false); });

  // Abas: clique, setas, Home e End (padrão WAI-ARIA de abas com ativação automática).
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = tab => {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !on;
    }
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const i = tabs.indexOf(tab);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      select(target);
      target.focus();
    });
  }
})();
