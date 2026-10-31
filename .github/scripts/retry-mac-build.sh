#!/usr/bin/env bash
set -uo pipefail

log="$(mktemp)"
status=1

probe_hdiutil() {
  local dir ok
  dir="$(mktemp -d)"
  mkdir "$dir/mnt"
  hdiutil create -quiet -size 4m -fs HFS+ -volname probe "$dir/probe.dmg" \
    && hdiutil attach -quiet -nobrowse -mountpoint "$dir/mnt" "$dir/probe.dmg" \
    && hdiutil detach -quiet "$dir/mnt"
  ok=$?
  rm -rf "$dir"
  return "$ok"
}

wait_for_hdiutil() {
  for check in 1 2 3 4 5 6; do
    probe_hdiutil && return 0
    echo "::warning::hdiutil does not work (check $check), restarting the disk image services"
    pgrep -lf diskimage
    sudo pkill -9 -f diskimage
    sleep 20
  done
  return 1
}

for attempt in 1 2 3; do
  wait_for_hdiutil || echo "::warning::hdiutil still does not work, building anyway"

  "$@" 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  [ "$status" -eq 0 ] && exit 0

  if ! grep -qE "hdiutil: (create|attach) failed|Resource busy|Device not configured" "$log"; then
    exit "$status"
  fi

  if [ "$attempt" -lt 3 ]; then
    echo "::warning::hdiutil could not create the disk image (attempt $attempt), retrying"
  fi
done

exit "$status"
