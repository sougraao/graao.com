# Migração do Supabase para São Paulo (D2 / P1.1)

**Decisão (usuário, 24/11/2026):** migrar o banco do Supabase de `us-east-2` (Ohio) para `sa-east-1` (São Paulo). Eu preparo; os passos de conta, cobrança e senhas são do dono da conta.

## Por quê

O servidor roda na Vercel em `gru1` (São Paulo) e o banco fica em Ohio. Cada leitura ou gravação do app atravessa o continente, ida e volta, e uma tela costuma fazer várias. Com o banco em São Paulo, servidor e banco ficam na mesma região.

Isto **não** resolve o tráfego de saída (egress) estourado: o egress conta igual em qualquer região. Ele é tratado à parte na D28 (commit `bd852f3`, que corta as leituras repetidas do agendador).

## Como está hoje (levantado em 24/11/2026, 14:20)

| Item | Produção (`zlkhoucdqfxgiorujifj`, Ohio) |
|---|---|
| Plano | Free, organização `minhasoci-bot's Org` |
| Banco | 18 MB no total; `go_workspaces` 1,4 MB (63 linhas) |
| Tabelas `public` | `go_workspaces`, `go_tracking_events` (vazia), `go_agency_audit` |
| Função `public` | `go_tracking_summary` |
| Login | 6 usuários, todos com Google, todos ativos nos últimos 30 dias |
| Storage | nenhum bucket (arquivos grandes vão para o Cloudflare R2) |
| Realtime | nenhuma tabela publicada |
| Extensões | `pg_cron`, `pg_net` (no schema `extensions`), `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp` |
| Agendador | job `graao-social-cron`, a cada minuto, chama `https://graao.com/api/social/cron` com o segredo do Vault |
| Vault | 1 segredo: `graao_cron_secret` |
| Cota | egress 11,2 de 5 GB (225%) neste ciclo; acima da cota também no ciclo anterior. Projetos restringidos a partir de **23/12/2026** se continuar acima |

**Antes de começar:**

- **Cota:** um projeto novo na mesma organização divide a mesma cota. Se a restrição de 23/12 chegar, ela vale para a organização inteira. Opções: esperar a D28 trazer o egress para baixo de 5 GB no ciclo seguinte, ou passar a organização para o **Pro** (US$ 25/mês, 250 GB de egress, backups diários, e libera a proteção de senha vazada da D3).
- **Limite de projetos:** o plano Free limita os projetos gratuitos ativos. A organização da graao tem 1; confirme no painel, ao criar, que cabe o segundo.
- **Ferramentas no computador de quem roda o passo 5:** Supabase CLI (já instalada aqui), **Docker Desktop aberto** (o `supabase db dump` roda o `pg_dump` num contêiner) e o cliente `psql`.

## Quem faz o quê

| Passo | Quem |
|---|---|
| Criar o projeto em São Paulo e guardar a senha do banco | Dono da conta |
| Google Cloud: acrescentar a URL de retorno do projeto novo | Dono da conta |
| Copiar o ID e o segredo do cliente Google para o projeto novo | Dono da conta |
| Rodar os comandos com as URLs de conexão (elas têm a senha) | Dono da conta, ou eu, com as variáveis definidas por você no terminal |
| Recriar o segredo do cron no Vault (o valor é o `CRON_SECRET`) | Dono da conta (eu não digito segredos) |
| Trocar `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` na Vercel e publicar | Eu, com a sua confirmação na hora |
| Conferências (contagens, login, cron, smoke) | Eu |

## Passo a passo

Tempo estimado da janela de troca: **10 a 15 minutos**, com o banco de 18 MB. A preparação (passos 1 a 3) pode ser feita dias antes.

### 1. Projeto novo (dono da conta)

1. No painel do Supabase, na organização `minhasoci-bot's Org`: **New project**, região **South America (São Paulo) `sa-east-1`**, Postgres 17 (o mesmo do atual).
2. Guarde a senha do banco num gerenciador de senhas. Ela não vai para o repositório nem para o chat.
3. Anote o identificador do projeto novo (`<NOVO>`) e, em *Project Settings → API Keys*, a chave publicável (`sb_publishable_...`).

### 2. Login com Google no projeto novo (dono da conta)

1. *Authentication → Sign In / Providers → Google*: ligar e colar o mesmo **Client ID** e **Client Secret** usados no projeto atual.
2. *Authentication → URL Configuration*: o mesmo **Site URL** e as mesmas **Redirect URLs** do projeto atual (copie de lá; inclui `https://graao.com/**`).
3. No Google Cloud Console, no mesmo cliente OAuth: em *Authorized redirect URIs*, **acrescente** `https://<NOVO>.supabase.co/auth/v1/callback`. Não remova a do projeto atual até o fim.

### 3. Ensaio sem parar a produção

Rode o passo 5 inteiro uma vez **sem** pausar o cron nem trocar a Vercel. Depois apague e recrie o projeto novo, ou rode `drop schema public cascade; create schema public;` nele. Isso mostra o tempo real e qualquer erro de restauração antes da janela.

### 4. Início da janela

1. Pausar o agendador no projeto **atual** (SQL Editor):
   ```sql
   select cron.alter_job(jobid, active := false) from cron.job where jobname = 'graao-social-cron';
   ```
2. A partir daqui, uma gravação feita no app atual pode ficar de fora da cópia. A janela deve ser curta, num horário de pouco uso.

### 5. Copiar esquema, papéis e dados (guia oficial "Backup and Restore using the CLI")

No terminal do dono da conta, com a URL de conexão de cada projeto, copiada do botão **Connect → Session pooler** de cada um (o endereço do servidor muda por projeto; não monte à mão). Elas contêm a senha: defina-as como variáveis só nesse terminal.

```powershell
$env:OLD_DB_URL = "<URL do Session pooler do projeto atual, com a senha>"
$env:NEW_DB_URL = "<URL do Session pooler do projeto novo, com a senha>"
```

```powershell
supabase db dump --db-url $env:OLD_DB_URL -f roles.sql --role-only
supabase db dump --db-url $env:OLD_DB_URL -f schema.sql
supabase db dump --db-url $env:OLD_DB_URL -f data.sql --use-copy --data-only
```

```powershell
psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command "SET session_replication_role = replica" --file data.sql --dbname $env:NEW_DB_URL
```

- Isso leva as tabelas `public` com as políticas (já com o hash da `GO_STORAGE_KEY`, que continua a mesma), a função, os grants e os dados de `auth` (os 6 usuários e as identidades Google, com os mesmos IDs).
- Apague `roles.sql`, `schema.sql` e `data.sql` depois: eles têm os dados dos clientes.

### 6. O que não vem na cópia (SQL Editor do projeto novo)

1. **Extensões:** confira `pg_cron`, `pg_net` no schema `extensions` e `supabase_vault`. Se faltar o `pg_net`: `create extension pg_net schema extensions;`.
2. **Segredo do cron (dono da conta):** o Vault é cifrado com uma chave de cada projeto, então o segredo é recriado à mão, colando o valor do `CRON_SECRET` da Vercel:
   ```sql
   select vault.create_secret('<CRON_SECRET>', 'graao_cron_secret');
   ```
3. **Agendador:**
   ```sql
   select cron.schedule('graao-social-cron', '* * * * *', $$
     select net.http_get(
       url := 'https://graao.com/api/social/cron',
       headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'graao_cron_secret')),
       timeout_milliseconds := 30000
     );
   $$);
   ```

### 7. Trocar a Vercel (eu, com a sua confirmação)

1. Em *Production*: `SUPABASE_URL = https://<NOVO>.supabase.co` e `SUPABASE_PUBLISHABLE_KEY = sb_publishable_...` do projeto novo. `GO_STORAGE_KEY` **não muda**: as políticas copiadas já usam o hash dela.
2. Publicar de novo a `main` (variável nova só vale num deploy novo).
3. A região da função continua `gru1`.

### 8. Conferências (eu)

1. **Contagens iguais nos dois projetos:**
   ```sql
   select (select count(*) from public.go_workspaces) as workspaces,
          (select count(*) from public.go_tracking_events) as tracking,
          (select count(*) from public.go_agency_audit) as auditoria,
          (select count(*) from auth.users) as usuarios,
          (select count(*) from auth.identities) as identidades;
   ```
2. **Smoke pós-deploy** verde e uma subconta real lida pelo app (`/api/client-portal/<id>/home` com 200).
3. **Login com Google** de uma pessoa da equipe. Os tokens antigos não valem no projeto novo, então cada pessoa provavelmente entra de novo uma vez.
4. **Agendador:** `cron.job_run_details` com `succeeded` e `net._http_response` com 200 nos minutos seguintes.
5. **Consultores** de segurança e de desempenho do projeto novo sem erros.

### 9. Voltar atrás, se algo falhar

1. Recolocar na Vercel o `SUPABASE_URL` e a `SUPABASE_PUBLISHABLE_KEY` antigos e publicar de novo.
2. Reativar o cron no projeto atual:
   ```sql
   select cron.alter_job(jobid, active := true) from cron.job where jobname = 'graao-social-cron';
   ```
3. Pausar o cron do projeto novo (`cron.alter_job(..., active := false)`), para os dois não rodarem juntos.

O que foi gravado no projeto novo durante o teste fica só lá. Com a janela curta, deve ser quase nada.

### 10. Depois

- Manter o projeto antigo pausado (não apagado) por 1 semana. Depois o dono da conta apaga, e remove a URL de retorno antiga do Google Cloud.
- Atualizar a memória "Acesso ao Supabase" e o `.env.local` com o identificador novo.
- Marcar P1.1 como feito no painel do plano de melhoria.
