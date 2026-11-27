#!/usr/bin/env bash
# Prepara uma VPS Ubuntu 22.04/24.04 limpa (ex.: Hostinger KVM) e sobe a Evolution API.
# Pode rodar de novo quando quiser: não apaga dados e não troca senhas já geradas.
#
#   sudo bash install.sh whatsapp.seudominio.com.br voce@email.com
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mAVISO: %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "rode como root: sudo bash install.sh <dominio> <email>"
[ -f /etc/os-release ] && . /etc/os-release
[ "${ID:-}" = "ubuntu" ] || warn "feito para Ubuntu; detectado ${ID:-desconhecido}"

# Arquivos copiados do Windows podem chegar com CRLF.
sed -i 's/\r$//' ./*.sh Caddyfile docker-compose.yml .env.example 2>/dev/null || true

if [ -f .env ]; then
  DOMAIN="${DOMAIN:-$(grep -E '^DOMAIN=' .env | cut -d= -f2-)}"
  EMAIL="${EMAIL:-$(grep -E '^ACME_EMAIL=' .env | cut -d= -f2-)}"
fi
[ -n "$DOMAIN" ] && [ -n "$EMAIL" ] || die "uso: sudo bash install.sh whatsapp.seudominio.com.br voce@email.com"
[ -f .env ] || [ -f .env.example ] || die "falta o arquivo .env.example nesta pasta. Envie a pasta de novo com o enviar-vps.ps1."

# Painel ou servidor web já instalado (modelo errado na contratação): o Caddy não conseguiria abrir 80/443.
busy=$(ss -Hltnp '( sport = :80 or sport = :443 )' 2>/dev/null | grep -v docker-proxy || true)
[ -z "$busy" ] || die "as portas 80/443 já estão em uso nesta VPS. Reinstale com Ubuntu 24.04 puro (sem painel):
$busy"

say "Atualizando o sistema e instalando o básico"
# VPS recém-criada costuma estar atualizando sozinha: espera o apt ficar livre e mantém as configurações do provedor.
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
APT=(apt-get -y -o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
"${APT[@]}" update
"${APT[@]}" upgrade
"${APT[@]}" install ca-certificates curl gnupg jq openssl ufw fail2ban unattended-upgrades dnsutils cron

say "Fuso horário America/Sao_Paulo"
timedatectl set-timezone America/Sao_Paulo || true

say "Swap (evita o Linux matar a Evolution por falta de memória)"
if ! swapon --show | grep -q .; then
  ram_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  swap_gb=$([ "$ram_mb" -le 4096 ] && echo 4 || echo 2)
  fallocate -l "${swap_gb}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((swap_gb * 1024))
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "swap de ${swap_gb} GB criado"
else
  echo "swap já existe"
fi
cat > /etc/sysctl.d/99-evolution.conf <<'EOF'
vm.swappiness=10
vm.overcommit_memory=1
fs.file-max=1000000
net.core.somaxconn=4096
net.ipv4.tcp_keepalive_time=120
net.ipv4.tcp_keepalive_intvl=30
net.ipv4.tcp_keepalive_probes=5
EOF
sysctl --system >/dev/null

say "Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  "${APT[@]}" update
  "${APT[@]}" install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  # live-restore: atualizar o Docker não derruba os containers.
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true
}
EOF
  systemctl restart docker
fi
systemctl enable --now docker

say "Firewall (só SSH, HTTP e HTTPS)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
# SSH em porta diferente da 22: libera também, para não trancar o acesso.
for port in $(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}'); do ufw allow "${port}/tcp" >/dev/null; done
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ufw status | head -n 12

say "Proteção contra força bruta no SSH e atualizações de segurança automáticas"
systemctl enable --now fail2ban
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/apt/apt.conf.d/52evolution-reboot <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF

say "Configuração (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^AUTHENTICATION_API_KEY=.*|AUTHENTICATION_API_KEY=$(openssl rand -hex 32)|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  echo ".env criado com chaves novas"
fi
sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
sed -i "s|^ACME_EMAIL=.*|ACME_EMAIL=${EMAIL}|" .env
chmod 600 .env
ram_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$ram_mb" -ge 7000 ] && grep -q '^EVOLUTION_MEM_LIMIT=2g$' .env; then
  sed -i 's|^EVOLUTION_MEM_LIMIT=.*|EVOLUTION_MEM_LIMIT=4g|' .env
fi

say "Conferindo o DNS de ${DOMAIN}"
my_ip=$(curl -fsS -4 -m 10 https://api.ipify.org || true)
dns_ip=$(dig +short A "$DOMAIN" | tail -n1)
if [ -z "$dns_ip" ]; then
  warn "${DOMAIN} ainda não tem registro A. Crie o registro apontando para ${my_ip:-o IP da VPS}; o HTTPS só funciona depois disso."
elif [ -n "$my_ip" ] && [ "$dns_ip" != "$my_ip" ]; then
  warn "${DOMAIN} aponta para ${dns_ip}, mas esta VPS é ${my_ip}. Se usa Cloudflare, deixe a nuvem cinza (DNS only)."
else
  echo "ok: ${DOMAIN} -> ${dns_ip}"
fi

say "Subindo a Evolution API"
chmod +x ./*.sh
# Atualização: guarda o banco antes de trocar a versão.
if [ -n "$(docker compose ps -q postgres 2>/dev/null)" ]; then
  echo "Backup antes de atualizar"
  ./maintenance.sh || warn "o backup falhou; a atualização continua, e o volume do banco não é apagado"
fi
docker compose pull
docker compose up -d --remove-orphans

printf 'Aguardando a API ficar saudável'
for _ in $(seq 1 60); do
  state=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q evolution)" 2>/dev/null || echo starting)
  [ "$state" = "healthy" ] && break
  printf '.'; sleep 5
done
echo
[ "${state:-}" = "healthy" ] || warn "a Evolution ainda não está saudável. Veja: docker compose logs --tail 100 evolution"

say "Manutenção diária (backup do banco e limpeza de mensagens antigas)"
cat > /etc/cron.d/evolution-maintenance <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 3 * * * root ${DIR}/maintenance.sh >> /var/log/evolution-maintenance.log 2>&1
*/10 * * * * root ${DIR}/guard-vps.sh >> /var/log/evolution-guard.log 2>&1
EOF
chmod 644 /etc/cron.d/evolution-maintenance
cat > /etc/logrotate.d/evolution <<'EOF'
/var/log/evolution-*.log {
  weekly
  rotate 4
  compress
  missingok
  notifempty
}
EOF

say "Testando o endereço público (o certificado HTTPS pode levar um minuto)"
public=""
for _ in $(seq 1 18); do
  if curl -fsS -m 10 "https://${DOMAIN}/" 2>/dev/null | jq -e '.version' >/dev/null 2>&1; then public=ok; break; fi
  printf '.'; sleep 5
done
echo
if [ -n "$public" ]; then
  echo "ok: https://${DOMAIN} respondendo"
else
  warn "https://${DOMAIN} ainda não responde. Confira o DNS e o firewall da Hostinger (80 e 443), depois rode: docker compose logs --tail 50 caddy"
fi

KEY=$(grep -E '^AUTHENTICATION_API_KEY=' .env | cut -d= -f2-)
say "Pronto!"
cat <<EOF

  URL da Evolution:   https://${DOMAIN}
  Painel (manager):   https://${DOMAIN}/manager
  API Key global:     ${KEY}

  No Vercel (projeto graao.app), em Settings -> Environment Variables:
    EVOLUTION_BASE_URL = https://${DOMAIN}
    EVOLUTION_API_KEY  = ${KEY}
  Depois faça um novo deploy. Guarde a chave num cofre de senhas.

  Depois do deploy, confira em Agência -> Configurações -> WhatsApp -> Testar servidor.
EOF
