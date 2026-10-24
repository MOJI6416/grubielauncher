#!/usr/bin/env bash
set -uo pipefail

log="$(mktemp)"
status=1

for attempt in 1 2 3; do
  "$@" 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  [ "$status" -eq 0 ] && exit 0

  if ! grep -qE "hdiutil: (create|attach) failed|Resource busy|Device not configured" "$log"; then
    exit "$status"
  fi

  if [ "$attempt" -lt 3 ]; then
    echo "::warning::hdiutil could not create the disk image (attempt $attempt), retrying"
    sleep $((attempt * 30))
  fi
done

exit "$status"
