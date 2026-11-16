#!/bin/sh
set -eu

umask 077

: "${DATABASE_BACKUP_URL:?DATABASE_BACKUP_URL is required}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=14}"
: "${BACKUP_INTERVAL_SECONDS:=86400}"

case "$BACKUP_RETENTION_DAYS" in
  ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a non-negative integer" >&2; exit 2 ;;
esac

case "$BACKUP_INTERVAL_SECONDS" in
  ''|*[!0-9]*) echo "BACKUP_INTERVAL_SECONDS must be a positive integer" >&2; exit 2 ;;
  0) echo "BACKUP_INTERVAL_SECONDS must be greater than zero" >&2; exit 2 ;;
esac

backup_once() {
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  temporary="$BACKUP_DIR/.scan-wifi-$timestamp.dump.tmp"
  destination="$BACKUP_DIR/scan-wifi-$timestamp.dump"

  mkdir -p "$BACKUP_DIR"
  pg_dump --dbname="$DATABASE_BACKUP_URL" --format=custom --compress=9 --file="$temporary"
  pg_restore --list "$temporary" >/dev/null
  mv "$temporary" "$destination"
  find "$BACKUP_DIR" -type f -name 'scan-wifi-*.dump' -mtime "+$BACKUP_RETENTION_DAYS" -delete
  echo "Backup completed: $destination"
}

case "${1:---once}" in
  --once)
    backup_once
    ;;
  --loop)
    while true; do
      backup_once
      sleep "$BACKUP_INTERVAL_SECONDS"
    done
    ;;
  *)
    echo "Usage: backup-postgres.sh [--once|--loop]" >&2
    exit 2
    ;;
esac
