// Google Business Profile optimization and local listings, shared by the server and the Reputação screen.

export const weekdays = [['MONDAY', 'Segunda'], ['TUESDAY', 'Terça'], ['WEDNESDAY', 'Quarta'], ['THURSDAY', 'Quinta'], ['FRIDAY', 'Sexta'], ['SATURDAY', 'Sábado'], ['SUNDAY', 'Domingo']];

const time = value => (value ? `${String(value.hours || 0).padStart(2, '0')}:${String(value.minutes || 0).padStart(2, '0')}` : '');
const clock = text => { const [hours, minutes] = String(text).split(':').map(Number); return { hours, minutes: minutes || 0 }; };

// Google periods → one row per weekday (the first period of each day) and whether a day has more than one.
export function hoursRows(regularHours) {
  const periods = regularHours?.periods || [];
  return weekdays.map(([day, label]) => {
    const list = periods.filter(period => period.openDay === day);
    const first = list[0];
    return { day, label, open: Boolean(first), from: time(first?.openTime) || '09:00', to: first?.closeTime?.hours === 24 ? '24:00' : time(first?.closeTime) || '18:00', split: list.length > 1 };
  });
}

// Rows from the editor → Google periods. Times are HH:MM, closing after opening (or 24:00).
export function hoursPeriods(rows) {
  const valid = value => /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value);
  return rows.filter(row => row.open).map(row => {
    if (!weekdays.some(([day]) => day === row.day) || !valid(row.from) || !valid(row.to) || row.from >= row.to) {
      throw Object.assign(new Error(`Confira o horário de ${weekdays.find(([day]) => day === row.day)?.[1] || 'um dia'}: o fechamento vem depois da abertura.`), { status: 400 });
    }
    return { openDay: row.day, openTime: clock(row.from), closeDay: row.day, closeTime: clock(row.to) };
  });
}

// The optimization checklist: what Google looks at in a complete profile, plus activity graao can see.
export function gbpChecklist(details = {}, { reviews = [], posts = 0 } = {}) {
  const description = String(details.profile?.description || '');
  const google = reviews.filter(row => row.googleName);
  const replied = google.filter(row => String(row.reply || '').trim()).length;
  const items = [
    ['name', 'Nome da empresa', Boolean(details.title), 5, 'O nome deve ser o mesmo da fachada, sem palavras-chave extras.'],
    ['category', 'Categoria principal', Boolean(details.categories?.primaryCategory), 15, 'Escolha no Google a categoria que melhor descreve o negócio.'],
    ['categories', 'Categorias adicionais', (details.categories?.additionalCategories || []).length > 0, 5, 'Adicione no Google as categorias dos outros serviços que você oferece.'],
    ['description', 'Descrição com 250+ caracteres', description.length >= 250, 15, 'Conte o que a empresa faz, para quem e onde, sem links nem promoções.'],
    ['phone', 'Telefone', Boolean(details.phoneNumbers?.primaryPhone), 10, 'Informe um telefone que atenda no horário de funcionamento.'],
    ['website', 'Site', Boolean(details.websiteUri), 10, 'Aponte para o site ou para uma página da empresa.'],
    ['hours', 'Horário de funcionamento', (details.regularHours?.periods || []).length > 0, 15, 'Clientes desistem quando não sabem se a empresa está aberta.'],
    ['address', 'Endereço ou área de atendimento', Boolean(details.storefrontAddress?.addressLines?.length || details.serviceArea), 10, 'Mostre onde atende para aparecer nas buscas da região.'],
    ['posts', 'Publicação nos últimos 7 dias', posts > 0, 5, 'Publique novidades pelo Planejador social, na rede Google Business.'],
    ['replies', 'Avaliações do Google respondidas', google.length > 0 && replied / google.length >= 0.8, 10, google.length ? `${replied} de ${google.length} respondidas. Responda pelo menos 80%.` : 'Sincronize as avaliações do Google para responder por aqui.']
  ].map(([id, label, done, weight, tip]) => ({ id, label, done, weight, tip }));
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round(items.filter(item => item.done).reduce((sum, item) => sum + item.weight, 0) / total * 100);
  return { score, items, description };
}

// Main directories for Brazilian and Latin American local businesses. graao does not sync them
// (that needs a paid partner such as Yext); the team keeps each profile right by hand and tracks it here.
export const directories = [
  ['google', 'Google (Perfil da Empresa)', 'https://business.google.com/', 'Busca e Maps. O mais importante.'],
  ['apple', 'Apple Business Connect', 'https://businessconnect.apple.com/', 'Mapas e Siri no iPhone.'],
  ['bing', 'Bing Places', 'https://www.bingplaces.com/', 'Busca do Bing, Copilot e Windows. Importa do Google.'],
  ['facebook', 'Facebook', 'https://www.facebook.com/pages/create', 'Página da empresa com endereço e horário.'],
  ['instagram', 'Instagram', 'https://www.instagram.com/accounts/convert_to_professional_account/', 'Conta profissional com endereço e contato.'],
  ['waze', 'Waze', 'https://www.waze.com/business/', 'Navegação. Usa o endereço do Google e anúncios locais.'],
  ['tripadvisor', 'Tripadvisor', 'https://www.tripadvisor.com.br/Owners', 'Turismo, restaurantes e hospedagem.'],
  ['reclameaqui', 'Reclame AQUI', 'https://www.reclameaqui.com.br/', 'Reputação de atendimento no Brasil.'],
  ['foursquare', 'Foursquare', 'https://foursquare.com/business/', 'Alimenta outros apps de mapa.'],
  ['linkedin', 'LinkedIn', 'https://www.linkedin.com/company/setup/new/', 'Página da empresa para serviços B2B.']
];
export const listingStatuses = [['unchecked', 'Não verificado', ''], ['ok', 'Correto', 'green'], ['divergent', 'Dados diferentes', 'pink'], ['missing', 'Não cadastrado', 'blue']];
