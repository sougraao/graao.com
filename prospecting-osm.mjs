// Keyless business search on OpenStreetMap, used when no Google Places key is configured.
// Nominatim geocodes the region and finds businesses by category; Photon finds them by name;
// a Nominatim lookup adds phone, website and e-mail. OSM data is ODbL: it may be stored
// with attribution ("© colaboradores do OpenStreetMap").
const USER_AGENT = 'graao.com-prospecting/1.0 (+https://graao.com)';
const NOMINATIM = process.env.PROSPECTING_NOMINATIM_URL?.trim() || 'https://nominatim.openstreetmap.org';
const PHOTON = process.env.PROSPECTING_PHOTON_URL?.trim() || 'https://photon.komoot.io';

function unavailable(message,status = 502) { throw Object.assign(new Error(message),{status}); }
const folded = value => String(value || '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();

// Common niches: [pattern, label, extra name terms searched on Photon].
const niches = [
  [/dentist|odonto/,'Dentista',['odonto','odontologia','dentista']],
  [/medic|clinica|consultorio|doctor/,'Clínica médica',['clinica','consultorio','medico']],
  [/fisio|physio/,'Fisioterapia',['fisioterapia','fisio']],
  [/psicolog|psychol|terapeut/,'Psicologia',['psicologia','psicologo']],
  [/nutri/,'Nutrição',['nutricionista','nutricao']],
  [/farmac|drogaria|pharmac/,'Farmácia',['farmacia','drogaria']],
  [/otica|optic/,'Ótica',['otica']],
  [/veterin|\bvet\b/,'Veterinário',['veterinaria','veterinario','vet']],
  [/pet ?shop|petshop|animais/,'Pet shop',['pet shop','pet']],
  [/academia|gym|fitness|crossfit|pilates/,'Academia',['academia','fitness','pilates','crossfit']],
  [/restaurante|restaurant/,'Restaurante',['restaurante']],
  [/pizza/,'Pizzaria',['pizzaria','pizza']],
  [/hamburg|burger|lanchonete/,'Lanchonete',['burger','hamburgueria','lanchonete']],
  [/cafe|cafeteria|coffee/,'Cafeteria',['cafe','cafeteria','coffee']],
  [/padaria|bakery|confeitaria/,'Padaria',['padaria','confeitaria']],
  [/salao|cabeleireir|hair|beleza|beauty|estetica|manicure/,'Salão de beleza',['salao','beleza','estetica','hair']],
  [/barbear|barber/,'Barbearia',['barbearia','barber']],
  [/advoga|advocacia|lawyer|juridic/,'Advocacia',['advocacia','advogados','advogado']],
  [/contab|contador|account/,'Contabilidade',['contabilidade','contabil']],
  [/imobiliar|real estate|corretor/,'Imobiliária',['imobiliaria','imoveis']],
  [/oficina|mecanic|auto ?center|car repair/,'Oficina mecânica',['oficina','auto center','mecanica']],
  [/hotel|pousada|hostel/,'Hospedagem',['hotel','pousada','hostel']],
  [/escola|colegio|school|curso/,'Escola',['escola','colegio','curso']],
  [/roupa|moda|boutique|clothes/,'Loja de roupas',['moda','boutique','store']],
  [/movel|moveis|furniture|decorac/,'Móveis e decoração',['moveis','decoracao']],
  [/floricultura|florist|flores/,'Floricultura',['floricultura','flores']],
  [/lavanderia|laundry/,'Lavanderia',['lavanderia']],
  [/tatu|tattoo/,'Estúdio de tatuagem',['tattoo','tatuagem']],
  [/fotograf|photo/,'Fotografia',['fotografia','foto']],
  [/arquitet|architect/,'Arquitetura',['arquitetura']]
];

const typeLabels = {
  dentist:'Dentista', clinic:'Clínica', doctors:'Consultório médico', hospital:'Hospital', pharmacy:'Farmácia', veterinary:'Veterinário',
  restaurant:'Restaurante', fast_food:'Lanchonete', cafe:'Cafeteria', bar:'Bar', pub:'Bar', bakery:'Padaria', hairdresser:'Salão de beleza',
  beauty:'Estética', lawyer:'Advocacia', accountant:'Contabilidade', estate_agent:'Imobiliária', car_repair:'Oficina mecânica',
  hotel:'Hotel', guest_house:'Pousada', school:'Escola', clothes:'Loja de roupas', optician:'Ótica', pet:'Pet shop',
  fitness_centre:'Academia', physiotherapist:'Fisioterapia', supermarket:'Mercado', florist:'Floricultura', furniture:'Móveis'
};
const poiKeys = new Set(['amenity','shop','office','craft','healthcare','leisure','tourism']);

export function nicheTerms(keyword) {
  const word = folded(keyword);
  return [...new Set([word,...niches.filter(([pattern]) => pattern.test(word)).flatMap(([, ,terms]) => terms)])].filter(Boolean).slice(0,4);
}

async function getJson(url,timeout = 15_000) {
  const response = await fetch(url,{ headers:{ 'User-Agent':USER_AGENT,Accept:'application/json','Accept-Language':'pt-BR,pt;q=0.9' },
    signal:AbortSignal.timeout(timeout),redirect:'error' }).catch(() => null);
  if (response?.status === 429) unavailable('O OpenStreetMap está recebendo muitas buscas. Tente de novo em alguns segundos.',429);
  if (!response?.ok) unavailable('O OpenStreetMap não respondeu. Tente novamente.');
  return response.json();
}
const settle = promise => promise.catch(() => null);

export async function geocode(location) {
  const url = new URL('/search',NOMINATIM);
  url.search = new URLSearchParams({ q:location,format:'jsonv2',limit:'1' });
  const [place] = await getJson(url);
  return place ? { lat:Number(place.lat),lon:Number(place.lon),label:place.display_name } : null;
}

export function boundingBox({ lat,lon },km) {
  const dLat = km/111.32, dLon = km/(111.32*Math.max(0.2,Math.cos(lat*Math.PI/180)));
  return { west:lon-dLon,south:lat-dLat,east:lon+dLon,north:lat+dLat };
}

export function distanceKm(a,b) {
  const rad = value => value*Math.PI/180;
  const dLat = rad(b.lat-a.lat), dLon = rad(b.lon-a.lon);
  const part = Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(part)));
}

const typeCode = { node:'N',way:'W',relation:'R',N:'N',W:'W',R:'R' };
const firstOf = value => String(value || '').split(';')[0].trim();
const label = (key,value) => typeLabels[value] || String(value || '').replace(/_/g,' ');

function fromNominatim(place) {
  const a = place.address || {}, x = place.extratags || {};
  if (!poiKeys.has(place.category)) return null;
  const code = typeCode[place.osm_type];
  return {
    placeId:`osm-${code}${place.osm_id}`, name:String(place.name || place.namedetails?.name || '').slice(0,140), category:label(place.category,place.type).slice(0,100),
    address:[[a.road,a.house_number].filter(Boolean).join(', '),a.suburb || a.neighbourhood].filter(Boolean).join(' - ').slice(0,220),
    city:String(a.city || a.town || a.village || a.municipality || '').slice(0,100), region:String(a.state || '').slice(0,100), postal:String(a.postcode || '').slice(0,24),
    phone:firstOf(x.phone || x['contact:phone'] || x['contact:mobile']).slice(0,40), website:firstOf(x.website || x['contact:website'] || x.url).slice(0,600),
    email:firstOf(x.email || x['contact:email']).slice(0,240), lat:Number(place.lat), lon:Number(place.lon)
  };
}

function fromPhoton(feature) {
  const p = feature.properties || {};
  if (!poiKeys.has(p.osm_key)) return null;
  const [lon,lat] = feature.geometry?.coordinates || [];
  return {
    placeId:`osm-${typeCode[p.osm_type]}${p.osm_id}`, name:String(p.name || '').slice(0,140), category:label(p.osm_key,p.osm_value).slice(0,100),
    address:[[p.street,p.housenumber].filter(Boolean).join(', '),p.district || p.locality].filter(Boolean).join(' - ').slice(0,220),
    city:String(p.city || '').slice(0,100), region:String(p.state || '').slice(0,100), postal:String(p.postcode || '').slice(0,24),
    phone:'', website:'', email:'', lat:Number(lat), lon:Number(lon)
  };
}

async function nominatimSearch(term,box) {
  const url = new URL('/search',NOMINATIM);
  url.search = new URLSearchParams({ q:term,format:'jsonv2',limit:'40',bounded:'1',viewbox:[box.west,box.north,box.east,box.south].join(','),
    addressdetails:'1',extratags:'1' });
  return (await getJson(url)).map(fromNominatim);
}

async function photonSearch(term,box) {
  const url = new URL('/api/',PHOTON);
  url.search = new URLSearchParams({ q:term,limit:'50',bbox:[box.west,box.south,box.east,box.north].join(',') });
  return ((await getJson(url)).features || []).map(fromPhoton);
}

export async function osmLookup(placeIds) {
  const ids = placeIds.map(id => /^osm-([NWR])(\d{1,15})$/.exec(id)).filter(Boolean).map(([,type,num]) => type+num).slice(0,50);
  if (!ids.length) return [];
  const url = new URL('/lookup',NOMINATIM);
  url.search = new URLSearchParams({ osm_ids:ids.join(','),format:'jsonv2',addressdetails:'1',extratags:'1' });
  return (await getJson(url)).map(fromNominatim).filter(row => row?.name);
}

export async function osmSearch(keywords,location,km) {
  const center = await geocode(location);
  if (!center) return { center:null,rows:[] };
  const box = boundingBox(center,km);
  const terms = [...new Set(keywords.flatMap(nicheTerms))].slice(0,6);
  const batches = await Promise.all([
    ...keywords.slice(0,3).map(term => settle(nominatimSearch(term,box))),
    ...terms.map(term => settle(photonSearch(term,box)))
  ]);
  if (batches.every(batch => batch === null)) unavailable('O OpenStreetMap não respondeu. Tente novamente.');
  const rows = new Map();
  for (const row of batches.flat()) {
    if (!row?.name || !Number.isFinite(row.lat) || distanceKm(center,row) > km) continue;
    const prior = rows.get(row.placeId);
    rows.set(row.placeId,prior ? { ...row,...Object.fromEntries(Object.entries(prior).filter(([,value]) => value)) } : row);
  }
  const list = [...rows.values()].sort((a,b) => distanceKm(center,a)-distanceKm(center,b)).slice(0,40);
  const missing = list.filter(row => !row.phone && !row.website).map(row => row.placeId);
  if (missing.length) {
    const extra = new Map(((await settle(osmLookup(missing))) || []).map(row => [row.placeId,row]));
    for (const row of list) {
      const more = extra.get(row.placeId);
      if (more) for (const key of ['phone','website','email','address','city','region','postal']) row[key] ||= more[key];
    }
  }
  return { center,rows:list };
}
