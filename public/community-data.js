// Communities: data shared by the server (community-config.mjs) and the screens — theme tokens and presets,
// the portal tabs, the automatic badges, the anti-spam starter pack and the plan intervals.

/** The 9 color tokens of a community theme. */
export const themeTokens = [
  ['primary', 'Principal'], ['onPrimary', 'Texto sobre o principal'], ['background', 'Plano de fundo'], ['tertiary', 'Destaque'], ['font', 'Texto'],
  ['sidebar', 'Barra lateral'], ['surface', 'Superfície'], ['border', 'Borda'], ['error', 'Erro']
];

/** Ready-made themes. */
export const themePresets = [
  // Paleta do graao: Padrão e Carvão sobre os cinzas neutros do app (#FAFAFA / #111111), os outros com fundo levemente tingido; cada principal lê com o seu texto (WCAG 4,5:1).
  { id: 'default', name: 'Padrão', tokens: { onPrimary: '#1a1410', primary: '#ff6b1a', background: '#fafafa', tertiary: '#fff0e6', font: '#1a1a1a', sidebar: '#ffffff', surface: '#ffffff', border: '#e5e5e5', error: '#c81e4b' } },
  { id: 'citrico', name: 'Brasa', tokens: { onPrimary: '#ffffff', primary: '#c2410c', background: '#fbf6f2', tertiary: '#fbebe1', font: '#2a160b', sidebar: '#ffffff', surface: '#ffffff', border: '#eedfd3', error: '#c81e4b' } },
  { id: 'sol', name: 'Sol', tokens: { onPrimary: '#ffffff', primary: '#a15c07', background: '#fdf8ee', tertiary: '#fbefd5', font: '#2b1d07', sidebar: '#ffffff', surface: '#ffffff', border: '#ece0c6', error: '#c81e4b' } },
  { id: 'floresta', name: 'Floresta', tokens: { onPrimary: '#ffffff', primary: '#1f7a4d', background: '#f5f8f3', tertiary: '#e2efe5', font: '#14261b', sidebar: '#ffffff', surface: '#ffffff', border: '#dbe5da', error: '#c81e4b' } },
  { id: 'oceano', name: 'Oceano', tokens: { onPrimary: '#ffffff', primary: '#0e7490', background: '#f3f8f8', tertiary: '#dcf1f3', font: '#0d2529', sidebar: '#ffffff', surface: '#ffffff', border: '#d4e4e6', error: '#c81e4b' } },
  { id: 'ameixa', name: 'Ameixa', tokens: { onPrimary: '#ffffff', primary: '#6d28d9', background: '#f7f4fa', tertiary: '#ede6fb', font: '#1f1633', sidebar: '#ffffff', surface: '#ffffff', border: '#e4ddef', error: '#c81e4b' } },
  { id: 'chiclete', name: 'Chiclete', tokens: { onPrimary: '#ffffff', primary: '#be185d', background: '#fbf4f6', tertiary: '#fbe4ee', font: '#2a1220', sidebar: '#ffffff', surface: '#ffffff', border: '#efdae3', error: '#c81e4b' } },
  { id: 'marfim', name: 'Marfim', tokens: { onPrimary: '#ffffff', primary: '#5c534a', background: '#faf7f3', tertiary: '#efe8df', font: '#1c1917', sidebar: '#fffdf9', surface: '#fffdf9', border: '#e6ded2', error: '#c81e4b' } },
  { id: 'carvao', name: 'Carvão', tokens: { onPrimary: '#1a1410', primary: '#ff6b1a', background: '#111111', tertiary: '#2e1a0e', font: '#f5f5f5', sidebar: '#161616', surface: '#1c1c1c', border: '#333333', error: '#ff8a9e' } },
  { id: 'grafite', name: 'Grafite', tokens: { onPrimary: '#111111', primary: '#f5f5f5', background: '#111111', tertiary: '#262626', font: '#f5f5f5', sidebar: '#161616', surface: '#1c1c1c', border: '#333333', error: '#ff8a9e' } },
  { id: 'meia-noite', name: 'Meia-noite', tokens: { onPrimary: '#0f1220', primary: '#8b9cff', background: '#0f1220', tertiary: '#1d2340', font: '#e7e9f5', sidebar: '#151a2e', surface: '#171c31', border: '#2a3152', error: '#ff8a9e' } },
  { id: 'noite-neon', name: 'Noite neon', tokens: { onPrimary: '#062a2d', primary: '#1fe5f0', background: '#111111', tertiary: '#0b2729', font: '#f5f5f5', sidebar: '#161616', surface: '#1c1c1c', border: '#333333', error: '#ff8a9e' } }
];
export const defaultTheme = () => ({ preset: 'default', tokens: { ...themePresets[0].tokens } });

/** The CSS variables a theme sets on the community page. */
// A token missing from a theme saved before it existed falls back to the theme's preset, then to the default.
export const themeStyle = theme => themeTokens.map(([key]) => `--cm-${key}:${theme?.tokens?.[key] || themePresets.find(row => row.id === theme?.preset)?.tokens[key]
  || (key === 'onPrimary' && /^#[0-9a-f]{6}$/i.test(theme?.tokens?.primary || '') ? textOn(theme.tokens.primary) : themePresets[0].tokens[key])}`).join(';');

// Light and dark mode for the member: the owner picks one theme; the other mode is derived from it, keeping
// the owner's main color but moving it until text and buttons stay readable (WCAG 4.5:1).
const rgb = color => [1, 3, 5].map(at => parseInt(color.slice(at, at + 2), 16));
const toHex = channels => `#${channels.map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('')}`;
const mixColor = (from, to, weight) => toHex(rgb(from).map((value, index) => value * (1 - weight) + rgb(to)[index] * weight));
const luminance = color => {
  const [r, g, b] = rgb(color).map(value => value / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** The WCAG contrast ratio of two #rrggbb colors. */
export const contrast = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };
const tokensOf = theme => ({ ...themePresets[0].tokens, ...(themePresets.find(row => row.id === theme?.preset)?.tokens || {}), ...(theme?.tokens || {}) });
export const themeIsDark = theme => luminance(tokensOf(theme).background) < 0.2;
const readable = (color, toward, against) => { let out = color; for (let step = 0; step < 14 && contrast(out, against) < 4.5; step++) out = mixColor(out, toward, 0.12); return out; };
const textOn = color => contrast('#ffffff', color) >= contrast('#0b0d10', color) ? '#ffffff' : '#0b0d10';
const modeBases = {
  dark: { background: '#111111', sidebar: '#161616', surface: '#1c1c1c', border: '#333333', font: '#f5f5f5', error: '#ff8a9e' },
  light: { background: '#fafafa', sidebar: '#ffffff', surface: '#ffffff', border: '#e5e5e5', font: '#1a1a1a', error: '#c81e4b' }
};
/** The theme in the mode the member chose ('light' | 'dark'); no choice, or the theme's own mode, keeps it as is. */
export function themeMode(theme, mode) {
  if (!modeBases[mode] || (mode === 'dark') === themeIsDark(theme)) return theme;
  const base = modeBases[mode], dark = mode === 'dark';
  const primary = readable(tokensOf(theme).primary, dark ? '#ffffff' : '#000000', dark ? base.background : base.surface);
  return { preset: theme?.preset || 'default', mode, tokens: { ...base, primary, onPrimary: textOn(primary), tertiary: mixColor(base.surface, primary, dark ? 0.22 : 0.14) } };
}

/** The theme's main color as text (links, the active icon): darkened or lightened only as far as it needs to be read. */
export const accentText = theme => { const t = tokensOf(theme); return readable(t.primary, themeIsDark(theme) ? '#ffffff' : '#000000', t.surface); };
/** A theme built from one color only (the mobile app's "Suas cores"): the default theme with that color, readable text on it. */
export const themeFromColor = color => {
  const base = themePresets[0].tokens, primary = /^#[0-9a-f]{6}$/i.test(color || '') ? color.toLowerCase() : base.primary;
  return { preset: 'custom', tokens: { ...base, primary, onPrimary: textOn(primary), background: mixColor('#ffffff', primary, 0.04), tertiary: mixColor('#ffffff', primary, 0.13), border: mixColor('#e6e6ec', primary, 0.06) } };
};
/** The theme as it is saved: a known preset or custom #rrggbb tokens. `error` says which color is wrong. */
export function cleanTheme(input) {
  const preset = themePresets.find(row => row.id === input?.preset);
  let error = '';
  const tokens = Object.fromEntries(themeTokens.map(([key, label]) => {
    const value = String(input?.tokens?.[key] ?? preset?.tokens[key] ?? themePresets[0].tokens[key]).toLowerCase();
    if (!error && !/^#[0-9a-f]{6}$/.test(value)) error = `A cor "${label}" precisa estar no formato #RRGGBB.`;
    return [key, value];
  }));
  // Tema próprio salvo antes do onPrimary: o texto do botão sai da própria cor principal, não do Padrão.
  if (!preset && input?.tokens?.onPrimary == null && /^#[0-9a-f]{6}$/.test(tokens.primary)) tokens.onPrimary = textOn(tokens.primary);
  return { theme: { preset: preset ? preset.id : 'custom', tokens }, error };
}

/** Tabs of the community in the portal; the admin renames, hides and reorders them. */
export const communityTabKeys = [['discussion', 'Discussão'], ['academy', 'Academia'], ['events', 'Eventos'], ['members', 'Membros'], ['ranking', 'Ranking'], ['about', 'Sobre']];
export const defaultTabs = () => communityTabKeys.map(([key, label]) => ({ key, label, visible: true }));
/** Tabs saved before the Academia existed get it right after the discussion. */
export function withAcademyTab(tabs) {
  const list = [...(tabs || defaultTabs())];
  if (list.some(row => row?.key === 'academy')) return list;
  const at = list.findIndex(row => row?.key === 'discussion');
  list.splice(at + 1, 0, { key: 'academy', label: 'Academia', visible: true });
  return list;
}

/** Blocks of the community's right column; the owner shows, hides and orders them. */
export const widgetKeys = [['about', 'Sobre'], ['events', 'Próximos eventos'], ['ranking', 'Top do ranking'], ['members', 'Membros recentes']];
export const composerPromptDefault = 'Compartilhe algo com a comunidade…';
export const defaultLayout = () => ({ widgets: widgetKeys.map(([key]) => ({ key, visible: true })), composerPrompt: '' });

/** Badges given automatically. Engagement ones count the current quarter. */
export const badgeCatalog = [
  { key: 'moderator', label: 'Moderador', kind: 'unique', description: 'Membros com a função de moderador.' },
  { key: 'founder', label: 'Membro fundador', kind: 'unique', description: 'Os 10 primeiros membros da comunidade.' },
  { key: 'newcomer', label: 'Novo membro', kind: 'unique', description: 'Entrou nos últimos 30 dias.' },
  { key: 'streak', label: 'Sequência de 7 dias', kind: 'quarter', description: 'Publicou ou comentou em 7 dias seguidos neste trimestre.' },
  { key: 'commenter', label: 'Comentarista', kind: 'quarter', description: '20 comentários ou mais neste trimestre.' },
  { key: 'creator', label: 'Criador de conteúdo', kind: 'quarter', description: '10 publicações ou mais neste trimestre.' },
  { key: 'inspiring', label: 'Inspirador', kind: 'quarter', description: '25 curtidas recebidas ou mais neste trimestre.' }
];

/** Anti-spam starter pack: expressions that hold a post or comment for review. */
export const spamPack = ['ganhe dinheiro', 'renda extra garantida', 'dinheiro fácil', 'clique aqui', 'bitcoin', 'criptomoeda', 'aposta', 'cassino', 'bet ', 'seguidores grátis',
  'chama no whats', 'chame no whatsapp', 'wa.me/', 't.me/', 'promoção imperdível', 'empréstimo', 'pix grátis', 'link na bio'];

export const planIntervals = [['month', 'por mês', 'Mensal'], ['year', 'por ano', 'Anual'], ['once', 'pagamento único', 'Vitalício']];
export const planPrice = plan => `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.price)} ${planIntervals.find(([key]) => key === plan.interval)?.[1] || ''}`.trim();
export const weekdays = [['0', 'Domingo'], ['1', 'Segunda'], ['2', 'Terça'], ['3', 'Quarta'], ['4', 'Quinta'], ['5', 'Sexta'], ['6', 'Sábado']];
