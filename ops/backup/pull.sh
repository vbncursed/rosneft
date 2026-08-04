#!/usr/bin/env bash
# Runs on the WORKSTATION, not on the host. The receiver pulls; the host does
# not push. A compromised or burned host cannot then erase the copies — under
# a push scheme it could.
#
# Written for macOS (BSD userland, no `stat -c%s`, and the stock `rsync` is
# openrsync — it does not understand GNU-only flags like `--info=stats2`).
# Nothing below needs GNU tools; if this ever runs on Linux too, that's
# incidental, not required.
set -euo pipefail

HOST=${HOST:-root@85.192.26.113}
DEST=${DEST:-$HOME/backups/andrey}
KEEP=${KEEP:-30}

mkdir -p "$DEST"
rsync -az --stats -e ssh "$HOST:/root/backups/" "$DEST/"

# Verify what arrived, on this side. A backup verified only on the machine
# that produced it is a backup verified by the thing that might be broken.
latest=$(ls -1t "$DEST"/andrey-*.sql.gz | head -1)
gzip -t "$latest"
echo "pull.sh: verified $latest"

ls -1t "$DEST"/andrey-*.sql.gz | tail -n +$((KEEP+1)) | xargs -r rm -f
