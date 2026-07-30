#!/usr/bin/env bash
# Backup restore rehearsal (Phase 6, DEPLOYMENT.md §9).
#
# Dumps the running Postgres container, restores it into a throwaway database on the
# same instance, and verifies row counts on a handful of tables match — the same
# verification a real cross-instance restore would need, minus the network transfer.
# "A backup that has never been restored is a hypothesis, not a backup" (DEPLOYMENT.md
# §9): this is what turns the documented 1h RTO / 15min RPO from a claim into something
# that has actually been timed.
#
# Local/staging use only — never point CONTAINER/DB at a production instance from here.
set -euo pipefail

# Git Bash (MSYS) rewrites leading-slash arguments like /tmp/... into Windows paths
# before exec'ing a native binary such as docker.exe, which breaks a path meant for
# *inside* the Linux container. Harmless on real Unix shells.
export MSYS_NO_PATHCONV=1

CONTAINER="${POSTGRES_CONTAINER:-ustogo-postgres}"
USER="${POSTGRES_USER:-ustogo}"
DB="${POSTGRES_DB:-ustogo}"
RESTORE_DB="ustogo_restore_rehearsal"
DUMP_FILE="/tmp/ustogo_rehearsal_$(date +%s).dump"
TABLES=(users cities categories bookings reviews notifications)

echo "== Backup restore rehearsal — $(date -u +%FT%TZ) =="
start=$(date +%s)

echo "-- Dumping $DB from $CONTAINER"
docker exec "$CONTAINER" pg_dump -U "$USER" -Fc -d "$DB" -f "$DUMP_FILE"

echo "-- Recreating $RESTORE_DB"
docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "DROP DATABASE IF EXISTS $RESTORE_DB;"
docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "CREATE DATABASE $RESTORE_DB;"

echo "-- Restoring into $RESTORE_DB"
docker exec "$CONTAINER" pg_restore -U "$USER" -d "$RESTORE_DB" --no-owner --no-acl "$DUMP_FILE"

end=$(date +%s)
elapsed=$((end - start))

echo "-- Verifying row counts (source vs. restored)"
mismatch=0
for table in "${TABLES[@]}"; do
  source_count=$(docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -tAc "SELECT count(*) FROM \"$table\";")
  restored_count=$(docker exec "$CONTAINER" psql -U "$USER" -d "$RESTORE_DB" -tAc "SELECT count(*) FROM \"$table\";")

  if [ "$source_count" = "$restored_count" ]; then
    echo "   $table: OK ($source_count rows)"
  else
    echo "   $table: MISMATCH (source=$source_count restored=$restored_count)"
    mismatch=1
  fi
done

docker exec "$CONTAINER" rm -f "$DUMP_FILE"

echo "== Rehearsal complete in ${elapsed}s =="
if [ "$mismatch" -ne 0 ]; then
  echo "One or more tables mismatched — restore is NOT verified." >&2
  exit 1
fi

echo "All sampled tables match. Record this run's duration in STATUS.md against the 1h RTO target."
