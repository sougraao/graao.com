# WhatsApp do graao.app com Evolution API na VPS da Hostinger

Esta pasta sobe a Evolution API v2.3.8 numa VPS e liga o graao.app a ela. Depois disso, cada subconta conecta o próprio número lendo um QR Code.

## Por que a Evolution costuma cair, e o que esta configuração faz

| Problema comum | O que está configurado |
|---|---|
| Atualização automática para uma versão com bug | Versão fixa `v2.3.8` (a última estável). A 2.4 exige ativação de licença e ainda é pré-release. |
| Reiniciou e pediu QR Code de novo | Sessões no Postgres (`DATABASE_SAVE_DATA_INSTANCE=true`, `CACHE_REDIS_SAVE_INSTANCES=false`) e volume persistente. |
| Container travado, mas ainda "vivo" | Healthcheck mais **autoheal**, que reinicia o container travado em até ~2 min. |
| Número caiu e ficou desconectado | **watchdog**: reconecta quem caiu e reinicia instância presa em "connecting" há 10 min. Não mexe em logout nem em banimento. |
| VPS sem memória: o Linux mata o processo | Swap automático, teto de memória por container e integrações que o graao não usa desligadas. |
| Disco cheio por logs e mensagens | Rotação de logs do Docker e limpeza diária de mensagens com mais de 30 dias. |
| Mensagem "Aguardando mensagem" no celular do cliente | Mensagens novas ficam salvas para o WhatsApp poder pedir reenvio. |
| Webhook perdido durante uma queda | Ao enviar, o graao confere o status ao vivo e regrava o webhook a cada conexão. |
| Atualizar o Docker derruba tudo | `live-restore` no Docker e `restart: unless-stopped` em todos os serviços. |
| Fica "conectada" mas para de receber, ou cai a cada ~50 min | Corrigido na `v2.3.8` (na 2.3.7 acontecia). Além disso, o graao reinicia sozinho a instância que não responde. |
| Mensagem recebida que não chega ao graao | A cada 2 min o graao busca na Evolution o que o webhook não entregou (até 24 h para trás) e guarda sem repetir. |
| Webhook apagado ou trocado | O graao confere a cada 10 min e registra de novo. |
| Resposta que não saiu durante uma queda | O graao reenvia quando o número volta, por até 30 min, só se tiver certeza de que não saiu. |
| Queda que ninguém percebe | Depois de 5 min fora do ar, aviso nas Conversas e na agência, e e-mail para a equipe se o envio de e-mail estiver configurado. |
| Disco cheio de repente | `guard-vps.sh` a cada 10 min: com 85% limpa o Docker; com 92%, também os backups antigos (guarda os 3 mais novos). |
| Docker parado | `guard-vps.sh` sobe de novo os containers que não estiverem rodando. |
| Ataque ao SSH ou a portas abertas | Firewall (só 22, 80 e 443), fail2ban e atualizações de segurança automáticas (reinício às 04:30, quando necessário). |

## 1. Contratar a VPS

- Plano: **KVM 2** (2 vCPU, 8 GB RAM) é folgado para dezenas de números. O **KVM 1** (4 GB) atende até cerca de 10 números. Estes limites são estimativas: acompanhe a memória com `docker stats`.
- Sistema: **Ubuntu 24.04 LTS** puro, sem painel. Não escolha o modelo "Evolution API" da Hostinger: ele usa outra configuração.
- Local: Brasil, se tiver. Senão, o mais próximo.
- Defina uma senha root forte. Se puder, cadastre também uma chave SSH.
- No firewall do painel da Hostinger (se estiver ativo), libere as portas 22, 80 e 443.

## 2. Apontar o subdomínio

No DNS do seu domínio, crie um registro **A**:

| Tipo | Nome | Valor |
|---|---|---|
| A | `whatsapp` | IP da VPS |

Se o domínio estiver na Cloudflare, deixe a nuvem **cinza** (DNS only). Assim o certificado HTTPS é emitido direto na VPS.

## 3. Enviar e instalar

No PowerShell do seu computador, na pasta do projeto, um comando envia os arquivos e instala tudo:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\evolution\enviar-vps.ps1 -Ip IP_DA_VPS -Dominio whatsapp.seudominio.com.br -Email seu@email.com
```

A senha root é pedida duas vezes (envio e instalação), a não ser que você use chave SSH. Só os arquivos de instalação são enviados: o `.env` e os backups do seu PC ficam de fora. Pode rodar de novo para atualizar: não apaga dados e não troca as chaves.

Ao final, o script mostra a **URL** e a **API Key global**. Guarde a chave num cofre de senhas.

## 4. Ligar o graao.app

Na Vercel, abra o projeto graao.app e vá em **Settings → Environment Variables** (Production):

```
EVOLUTION_BASE_URL = https://whatsapp.seudominio.com.br
EVOLUTION_API_KEY  = (a API Key global)
```

Faça um novo deploy e abra **Agência → Configurações → WhatsApp → Testar servidor**: a página mostra a versão e os números conectados, ou o motivo da falha. Cada subconta conecta em **Configurações → WhatsApp → Conectar** e lê o QR Code.

Outro caminho, sem variável de ambiente: em **Usar servidor de WhatsApp próprio**, cole a URL e a chave. A chave fica criptografada no banco.

Para conferir tudo pela linha de comando (cria uma instância de teste, pede o QR e apaga no fim), preencha as duas variáveis no `.env.local` e rode:

```powershell
npm run smoke:evolution
```

## Dia a dia

```bash
cd /opt/evolution
docker compose ps                         # todos devem estar "Up (healthy)"
docker compose logs --tail 100 evolution  # erros da API
docker compose logs --tail 50 watchdog    # quedas e reconexões automáticas
docker compose restart evolution          # reinício manual (as sessões continuam)
tail -n 20 /var/log/evolution-maintenance.log
```

O painel da Evolution fica em `https://whatsapp.seudominio.com.br/manager` (o login usa a API Key global).

### Atualizar a Evolution

Antes de atualizar, leia as notas da versão em <https://github.com/EvolutionAPI/evolution-api/releases>. Depois troque a tag `image:` no `docker-compose.yml` e rode:

```bash
bash maintenance.sh            # backup antes
docker compose pull evolution && docker compose up -d evolution
```

Se der problema, volte a tag anterior e rode `docker compose up -d evolution` de novo.

Atualizar pelo seu PC é mais simples: rode o `enviar-vps.ps1` de novo com os mesmos dados. Ele faz um backup antes, troca só o que mudou e não mexe nas chaves nem nas sessões.

### Restaurar um backup

Os backups diários ficam em `/opt/evolution/backups` (7 dias). A restauração troca o banco atual inteiro pelo do backup, numa transação só: se der erro, nada muda.

```bash
docker compose stop evolution watchdog
gunzip -c backups/evolution-AAAAMMDD-HHMM.sql.gz | docker compose exec -T postgres psql -U evolution -d evolution -q -v ON_ERROR_STOP=1 --single-transaction
docker compose start evolution watchdog
```

Esses backups ficam na própria VPS. Para se proteger da perda da VPS inteira, ligue também os backups do painel da Hostinger. O `.env` tem a API Key: guarde-a no cofre de senhas.

### Excluir a instância de uma subconta

Em **Agência → Configurações → WhatsApp**, o botão **Excluir instância** desconecta o número e apaga a instância do servidor, o que libera memória da VPS. As conversas continuam no graao.app.

### Monitoramento externo (recomendado)

Cadastre `https://whatsapp.seudominio.com.br/` num monitor gratuito, como UptimeRobot ou Better Stack, para receber um alerta se a VPS inteira cair.

## Rodar no seu PC Windows em vez da VPS

É a mesma stack, no Docker Desktop. O endereço HTTPS público vem do **Tailscale Funnel** (`https://seu-pc.xxxx.ts.net`): não precisa abrir porta no roteador nem mexer no DNS. O Caddy fica desligado, e o backup diário roda num container (`maintenance`), porque o Windows não tem cron.

1. Instale o **Docker Desktop**. Em *Settings → General*, deixe marcado **Start Docker Desktop when you sign in**.
2. Instale o **Tailscale**, entre na sua conta e libere **HTTPS** e **Funnel** no painel do Tailscale. O próprio comando mostra o link na primeira vez.
3. Na pasta do projeto, rode:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\evolution\start-pc.ps1
```

4. Copie a URL e a chave que o script mostra para a Vercel (`EVOLUTION_BASE_URL` e `EVOLUTION_API_KEY`) e faça um novo deploy.

Para o WhatsApp não cair:
- O PC não pode **suspender nem hibernar**: em *Configurações → Sistema → Energia*, coloque "Nunca" para suspensão na tomada.
- O **Windows Update** reinicia o PC sozinho. Defina o horário ativo para o dia todo, ou pause as atualizações. Depois de um reinício, o Docker Desktop e o Tailscale voltam ao entrar no Windows e os containers sobem sozinhos.
- Se o PC desligar, o WhatsApp para de enviar e receber até ele voltar. Nesse intervalo, as mensagens que chegam ficam no celular, mas não entram no graao. Para uso sério e contínuo, a VPS continua sendo o caminho.

Comandos úteis (na pasta `deploy\evolution`):

```powershell
docker compose -f docker-compose.yml -f docker-compose.pc.yml ps
```

```powershell
docker compose -f docker-compose.yml -f docker-compose.pc.yml logs --tail 50 watchdog
```

## Limites

- A Evolution usa o WhatsApp Web (não é a API oficial da Meta). Ela não cai por causa do servidor, mas o WhatsApp pode **banir números** que disparam muitas mensagens para quem não conhece. Aqueça números novos e evite listas frias.
- Se o cliente remover o aparelho no celular (logout), só ele resolve, lendo o QR de novo. O watchdog não insiste nesses casos.
- Mensagens recebidas de grupos e de status são ignoradas: as Conversas tratam apenas contatos individuais. O envio para grupos existe só no Planejador de eventos.
- Um número por subconta. Cada subconta tem a própria instância, `graao_<subconta>`.
