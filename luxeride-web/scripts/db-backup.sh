#!/usr/bin/env bash
#
# The entire backup story for LuxeRide.
#
#   scripts/db-backup.sh                 take a compressed dump, prune old ones
#   scripts/db-backup.sh --restore FILE  restore into a scratch database (drill)
#   scripts/db-backup.sh --list          show what is on disk and its age
#
# WHY THIS IS A SCRIPT AND NOT A MANAGED SERVICE
#
# Decision 1 chose a local Postgres cluster on this workstation instead of a
# hosted provider, and a local cluster ships no managed daily backups. There is
# also no git repository history for the *data* — only for the code. That leaves
# exactly one recovery path, and this is it. `commerce-backend` §2.8 and the
# E-track's E5.
#
# THE DRILL IS THE POINT
#
# A backup that has never been restored is a hypothesis. `--restore` exists so the
# weekly rehearsal is one command rather than a page of instructions nobody
# follows. Run it at least weekly, and after any migration that changes a table.
#
# Secrets: the connection string is read from .env.local and is never echoed. The
# dump lands outside the repository, so it can never be committed.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${LUXERIDE_ENV_FILE:-$PROJECT_ROOT/.env.local}"

# Outside the repo on purpose — see the header.
BACKUP_DIR="${LUXERIDE_BACKUP_DIR:-$HOME/luxeride-backups}"
RETAIN_DAYS="${LUXERIDE_BACKUP_RETAIN_DAYS:-14}"
PREFIX="luxeride"

die() { printf 'db-backup: %s\n' "$1" >&2; exit 1; }

read_database_url() {
  [ -f "$ENV_FILE" ] || die "no $ENV_FILE — copy .env.example there and fill it in"
  # Take the last assignment, strip surrounding quotes and any trailing comment.
  local line
  line="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$ENV_FILE" | tail -1 || true)"
  [ -n "$line" ] || die "DATABASE_URL is not set in $ENV_FILE"
  line="${line#*=}"
  line="${line%%#*}"
  line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  [ -n "$line" ] || die "DATABASE_URL in $ENV_FILE is empty"
  case "$line" in
    *user:pass@*) die "DATABASE_URL is still the placeholder — nothing to back up" ;;
  esac
  printf '%s' "$line"
}

prune() {
  [ -d "$BACKUP_DIR" ] || return 0
  local before after
  before="$(find "$BACKUP_DIR" -maxdepth 1 -name "$PREFIX-*.dump" -type f | wc -l)"
  find "$BACKUP_DIR" -maxdepth 1 -name "$PREFIX-*.dump" -type f -mtime "+$RETAIN_DAYS" -delete
  after="$(find "$BACKUP_DIR" -maxdepth 1 -name "$PREFIX-*.dump" -type f | wc -l)"
  printf '  retention: kept %s, pruned %s older than %s days\n' "$after" "$((before - after))" "$RETAIN_DAYS"
}

cmd_backup() {
  local url out
  url="$(read_database_url)"
  command -v pg_dump >/dev/null 2>&1 || die "pg_dump is not installed"

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  out="$BACKUP_DIR/$PREFIX-$(date +%Y%m%d-%H%M%S).dump"

  # -Fc is the custom format: compressed, and restorable selectively with
  # pg_restore. --no-owner so a restore into a differently-named role works.
  pg_dump -Fc --no-owner --no-privileges -d "$url" -f "$out" || die "pg_dump failed"

  # A dump that is empty is not a backup.
  local size
  size="$(stat -c '%s' "$out")"
  [ "$size" -gt 0 ] || die "pg_dump produced an empty file — not treating that as a backup"

  printf 'db-backup: wrote %s (%s bytes)\n' "$out" "$size"
  prune
  printf '\nRehearse it before you trust it:\n  scripts/db-backup.sh --restore %s\n' "$out"
}

cmd_restore() {
  local file="${1:-}"
  [ -n "$file" ] || die "--restore needs a dump file; see --list"
  [ -f "$file" ] || die "no such dump: $file"
  command -v pg_restore >/dev/null 2>&1 || die "pg_restore is not installed"

  local stamp target
  stamp="$(date +%Y%m%d-%H%M%S)"
  target="luxeride_restore_$stamp"

  local url
  url="$(read_database_url)"
  # Restoring over live data is the mistake this phrase exists to prevent: a
  # scratch database is always the target, never the source.
  local admin_url="${url%/*}/postgres"

  printf 'db-backup: creating scratch database %s\n' "$target"
  psql -d "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$target\"" >/dev/null \
    || die "could not create the scratch database — is the cluster running?"

  printf 'db-backup: restoring %s into it\n' "$file"
  # --no-owner because the dump was taken that way; the target role differs.
  pg_restore --no-owner --no-privileges -d "${url%/*}/$target" "$file" \
    || printf 'db-backup: pg_restore reported warnings (grants/ownership are expected to differ)\n'

  printf '\nRow counts in the restored copy:\n'
  psql -d "${url%/*}/$target" -tAc "
    select relname || ' = ' || n_live_tup
    from pg_stat_user_tables
    order by n_live_tup desc, relname" | sed 's/^/  /'

  printf '\nCompare those against the live database with:\n'
  printf '  psql -d "%s" -tAc "select relname || '"'"' = '"'"' || n_live_tup from pg_stat_user_tables order by relname"\n' "${url%/*}/luxeride"
  printf '\nThen drop the scratch copy:\n'
  printf '  psql -d "%s" -c '"'"'DROP DATABASE "%s"'"'"'\n' "$admin_url" "$target"
}

cmd_list() {
  [ -d "$BACKUP_DIR" ] || die "no $BACKUP_DIR yet — run a backup first"
  printf 'Dumps in %s (retention %s days):\n' "$BACKUP_DIR" "$RETAIN_DAYS"
  find "$BACKUP_DIR" -maxdepth 1 -name "$PREFIX-*.dump" -type f -printf '  %TY-%Tm-%Td %TH:%TM  %10s  %p\n' | sort
  printf '\nThe newest one has never been proven until it has been restored:\n'
  printf '  scripts/db-backup.sh --restore "$(ls -t %s/%s-*.dump | head -1)"\n' "$BACKUP_DIR" "$PREFIX"
}

case "${1:-}" in
  "")            cmd_backup ;;
  --restore)     shift; cmd_restore "${1:-}" ;;
  --list)        cmd_list ;;
  -h|--help)     sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
  *)             die "unknown argument: $1 (try --help)" ;;
esac
