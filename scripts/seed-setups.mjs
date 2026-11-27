// Coloca os setups convertidos dos snapshots GHL em "Meus setups" da agência de um usuário.
//
//   node --env-file-if-exists=.env.local scripts/seed-setups.mjs --email pessoa@exemplo.com [--dry-run]
//
// Usa o mesmo banco do servidor: Supabase quando as variáveis estão configuradas, senão o SQLite local
// (GO_DB_PATH ou .data/go.sqlite). Acha a agência pelo e-mail do dono (profile.email) ou de um usuário convidado.
// Rodar de novo não duplica nada.
import { resolve } from 'node:path';
import { audit, hydrateAgency } from '../agency-model.mjs';
import { seedSetups } from '../setup-ghl-snapshots.mjs';
import { createSqliteStore, supabaseFromEnv } from '../storage.mjs';

const args = process.argv.slice(2);
const email = (args[args.indexOf('--email') + 1] || '').trim().toLowerCase();
const dryRun = args.includes('--dry-run');
if (!args.includes('--email') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: node scripts/seed-setups.mjs --email pessoa@exemplo.com [--dry-run]');
  process.exit(1);
}

const store = supabaseFromEnv() || createSqliteStore(resolve(process.env.GO_DB_PATH || resolve(import.meta.dirname, '..', '.data', 'go.sqlite')));
const found = await store.findAgency({ profile: { email } }) || await store.findAgency({ users: [{ email }] });
if (!found) {
  console.error(`Nenhuma agência encontrada para ${email}. A pessoa precisa ter entrado no graao pelo menos uma vez.`);
  process.exit(1);
}
const preview = seedSetups(hydrateAgency(structuredClone(found.state), found.id));
console.log(`Agência ${found.id} (${found.state.profile?.name || 'sem nome'})`);
console.log(`  a adicionar: ${preview.added.join(' · ') || 'nada'}`);
if (preview.skipped.length) console.log(`  já existem: ${preview.skipped.join(' · ')}`);
if (dryRun || !preview.added.length) process.exit(0);
const result = await store.change(found.id, state => {
  const agency = hydrateAgency(state, found.id);
  const out = seedSetups(agency);
  Object.assign(state, agency);
  audit(state, 'Graao', 'Setups imported', out.added.join(', '), 'Snapshots GHL convertidos');
  return out;
});
console.log(`Pronto: ${result.added.length} setup(s) em Meus setups.`);
store.close?.();
