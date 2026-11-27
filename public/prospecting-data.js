export const prospectSources = { Manual:'Manual', Maps:'Google Maps', OSM:'OpenStreetMap', AI:'Prospect AI', Widget:'Widget' };
export const prospectLeadStatus = { Open:'Lead aberto', Won:'Ganho', Lost:'Perdido' };
export const prospectSections = {
  address:'Endereço', summary:'Pontuação geral', business:'Dados da empresa', website:'Site',
  health:'Saúde do site', stack:'Tecnologias e redes sociais',
  listings:'Perfil no Google e presença local', reputation:'Avaliações e reputação', next:'Próximos passos'
};
export const prospectThemes = { blue:'Azul', pink:'Pink graao', teal:'Verde', graphite:'Grafite' };
export const normalizeProspectTheme = theme => theme === 'violet' ? 'pink' : theme;

export function blankProspecting() {
  return { categories:[], widgets:[], agents:[], brand:{ theme:'blue', title:'Auditoria de marketing', intro:'', footer:'' },
    sections:Object.keys(prospectSections).map(key => ({ key, visible:true })) };
}

export function leadStatus(row) { return row.status === 'Won' || row.status === 'Lost' ? row.status : 'Open'; }

export function prospectSearchText(row) {
  return [row.name,row.city,row.region,row.address,row.category,row.website,row.postal,row.niche].filter(Boolean).join(' ');
}

export function folded(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
}

export function opportunityScore(signals) {
  const grades = Object.values(signals || {}).filter(value => Number.isFinite(value));
  return grades.length ? Math.round(100 - grades.reduce((sum,value) => sum+value*10,0)/grades.length) : null;
}
