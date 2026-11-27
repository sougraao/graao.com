#!/usr/bin/env bash
# Manutenção diária da Evolution (agendada pelo install.sh em /etc/cron.d/evolution-maintenance, 03:30).
#   1. Backup compactado do Postgres em ./backups (guarda BACKUP_RETENTION_DAYS dias).
#   2. Apaga mensagens com mais de MESSAGE_RETENTION_DAYS dias (o graao.app já tem a cópia delas).
#   3. Remove imagens Docker antigas para o disco não encher.
set -euo pipefail
cd "$(dirname "$0")"

env_value() { grep -E "^$1=" .env | cut -d= -f2- || true; }
KEEP_MSG="$(env_value MESSAGE_RETENTION_DAYS)"; KEEP_MSG="${KEEP_MSG:-30}"
KEEP_BKP="$(env_value BACKUP_RETENTION_DAYS)"; KEEP_BKP="${KEEP_BKP:-7}"
stamp() { date '+%Y-%m-%d %H:%M:%S'; }

mkdir -p backups
chmod 700 backups
file="backups/evolution-$(date +%Y%m%d-%H%M).sql.gz"
if docker compose exec -T postgres pg_dump -U evolution -d evolution --no-owner --clean --if-exists | gzip -6 > "$file.tmp"; then
  # Backup cortado ou vazio não substitui os bons: confere antes de aceitar.
  if gzip -t "$file.tmp" 2>/dev/null && gunzip -c "$file.tmp" | grep -q 'PostgreSQL database dump complete'; then
    mv "$file.tmp" "$file"
    echo "$(stamp) backup ok: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "$(stamp) ERRO: backup incompleto, descartado"
  fi
else
  rm -f "$file.tmp"
  echo "$(stamp) ERRO no backup do Postgres"
fi
# Nunca apaga os 3 mais novos, mesmo vencidos: se o backup parar de funcionar, o último bom fica.
find backups -name 'evolution-*.sql.gz' -printf '%T@ %p\n' | sort -rn | tail -n +4 | cut -d' ' -f2- | while read -r old; do
  [ -n "$(find "$old" -mtime +"$KEEP_BKP")" ] && rm -f "$old"
done || true

deleted=$(docker compose exec -T postgres psql -U evolution -d evolution -tAc \
  "WITH gone AS (DELETE FROM \"Message\" WHERE \"messageTimestamp\" < extract(epoch FROM now() - interval '${KEEP_MSG} days') RETURNING 1) SELECT count(*) FROM gone;" 2>&1) \
  && echo "$(stamp) mensagens antigas apagadas: ${deleted}" \
  || echo "$(stamp) AVISO: limpeza de mensagens falhou: ${deleted}"

docker image prune -f >/dev/null
echo "$(stamp) disco: $(df -h / | awk 'NR==2 {print $4 " livres de " $2}')"
