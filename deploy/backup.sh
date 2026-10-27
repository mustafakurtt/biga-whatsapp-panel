#!/usr/bin/env bash
# Biga Panel yedeği: SQLite veritabanı (tutarlı kopya) + WhatsApp oturum klasörü.
#
# Sunucuda (host) çalışır ve çalışan konteynere "docker compose exec" ile bağlanır.
# Host'ta sqlite3 kurulu olması GEREKMEZ: kopya, konteynerdeki Bun'ın yerleşik SQLite'ı ile
# "VACUUM INTO" kullanılarak alınır. Veritabanı WAL modunda olduğu için dosyayı düz kopyalamak
# yarım/bozuk bir yedek verebilir; VACUUM INTO, uygulama çalışırken bile tutarlı bir kopya üretir.
#
# Kullanım:
#   ./backup.sh                      # deploy/backups/ içine yazar, son 14 yedeği tutar
#   BACKUP_DIR=/var/backups/biga KEEP=30 ./backup.sh
#
# Cron örneği (her gece 03:15; "crontab -e" ile ekleyin, yolu kendinize göre düzeltin):
#   15 3 * * * /opt/biga-panel/deploy/backup.sh >> /var/log/biga-backup.log 2>&1
#
# Çıktılar (zaman damgalı):
#   app-YYYYmmdd-HHMMSS.db.gz        veritabanı
#   baileys-YYYYmmdd-HHMMSS.tar.gz   WhatsApp oturum anahtarları (ÇOK GİZLİ: numaranın kontrolü demektir)
#
# Geri yükleme: deploy/restore.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
KEEP="${KEEP:-14}"
SERVICE="${SERVICE:-app}"
COMPOSE=(docker compose -f "$SCRIPT_DIR/docker-compose.yml")

case "$KEEP" in
  '' | *[!0-9]* | 0) echo "KEEP pozitif bir sayı olmalı (şu an: '$KEEP')" >&2; exit 1 ;;
esac

TS="$(date +%Y%m%d-%H%M%S)"
TMP_IN_CONTAINER="/tmp/biga-backup-$TS.db"
DB_OUT="$BACKUP_DIR/app-$TS.db.gz"
AUTH_OUT="$BACKUP_DIR/baileys-$TS.tar.gz"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

cleanup() {
  status=$?
  "${COMPOSE[@]}" exec -T "$SERVICE" rm -f "$TMP_IN_CONTAINER" >/dev/null 2>&1 || true
  if [ "$status" -ne 0 ]; then
    rm -f "$DB_OUT" "$AUTH_OUT"
    log "HATA: yedek alınamadı (çıkış kodu $status). Yarım dosyalar silindi."
  fi
  exit "$status"
}
trap cleanup EXIT

if [ -z "$("${COMPOSE[@]}" ps --status running -q "$SERVICE" 2>/dev/null)" ]; then
  log "HATA: '$SERVICE' konteyneri çalışmıyor. Önce: cd $SCRIPT_DIR && docker compose up -d"
  exit 1
fi

# 1) Veritabanı: konteyner içinde VACUUM INTO, bütünlük kontrolü, sonra host'a aktar.
log "Veritabanı yedekleniyor..."
"${COMPOSE[@]}" exec -T -e "BACKUP_OUT=$TMP_IN_CONTAINER" "$SERVICE" bun -e '
  import { Database } from "bun:sqlite";
  const src = new Database(process.env.DATABASE_PATH);
  src.exec("PRAGMA busy_timeout = 10000;");
  src.prepare("VACUUM INTO ?").run(process.env.BACKUP_OUT);
  src.close();
  const copy = new Database(process.env.BACKUP_OUT, { readonly: true });
  const result = copy.query("PRAGMA integrity_check").get();
  copy.close();
  const value = Object.values(result ?? {})[0];
  if (value !== "ok") { console.error("integrity_check:", value); process.exit(1); }
'
"${COMPOSE[@]}" exec -T "$SERVICE" cat "$TMP_IN_CONTAINER" | gzip -9 > "$DB_OUT"
gzip -t "$DB_OUT"
log "  -> $DB_OUT ($(du -h "$DB_OUT" | cut -f1))"

# 2) WhatsApp oturum klasörü.
# Not: Baileys bu dosyaları çalışırken güncelleyebilir; tar anlık bir kopyadır. Gece gibi sakin bir
# saatte almak en iyisi. Eski bir oturum yedeği her zaman çalışmayabilir (bkz. restore.md).
if "${COMPOSE[@]}" exec -T "$SERVICE" sh -c 'test -d "$BAILEYS_AUTH_DIR"'; then
  log "WhatsApp oturumları yedekleniyor..."
  "${COMPOSE[@]}" exec -T "$SERVICE" sh -c \
    'tar -czf - -C "$(dirname "$BAILEYS_AUTH_DIR")" "$(basename "$BAILEYS_AUTH_DIR")"' > "$AUTH_OUT"
  tar -tzf "$AUTH_OUT" >/dev/null
  log "  -> $AUTH_OUT ($(du -h "$AUTH_OUT" | cut -f1))"
else
  log "WhatsApp oturum klasörü henüz yok (bağlı numara yok), atlandı."
fi

# 3) Saklama: her türden en yeni KEEP dosya kalır.
prune() {
  local pattern="$1" n=0 f
  # Dosya adları zaman damgalı olduğundan ters alfabetik sıra = yeniden eskiye.
  for f in $(ls -1 "$BACKUP_DIR"/$pattern 2>/dev/null | sort -r); do
    n=$((n + 1))
    if [ "$n" -gt "$KEEP" ]; then
      rm -f -- "$f"
      log "  eski yedek silindi: $(basename "$f")"
    fi
  done
}
prune 'app-*.db.gz'
prune 'baileys-*.tar.gz'

log "Yedek tamam. Bir kopyasını mutlaka sunucu DIŞINA da alın (bkz. docs/deploy.md)."
