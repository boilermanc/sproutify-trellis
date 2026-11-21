#!/usr/bin/env bash
set -Eeuo pipefail

stage="/var/www/vhosts/sweetwaterurbanfarms.com/.trellis-deploy/clip-render-worker-20260821"
workers_root="/opt/trellis/workers"
target="${workers_root}/clip-render-worker"
next="${workers_root}/.clip-render-worker-next-20260821"
backup="${workers_root}/clip-render-worker-backup-20260821"
service="trellis-clip-render"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi
if [[ ! -f "${stage}/worker.mjs" || ! -d "${stage}/node_modules" ]]; then
  echo "The verified staging bundle is incomplete." >&2
  exit 1
fi
if [[ ! -f "${target}/package.json" ]] || ! grep -q 'trellis-clip-render-worker' "${target}/package.json"; then
  echo "The live worker target did not match the expected service." >&2
  exit 1
fi
if [[ -e "${next}" || -e "${backup}" ]]; then
  echo "A next or backup directory already exists; refusing to overwrite it." >&2
  exit 1
fi

cp -a "${stage}" "${next}"
chown -R root:root "${next}"
cd "${next}"
node --check worker.mjs
npx remotion compositions remotion/index.ts >/tmp/trellis-media-finishing-compositions.txt

systemctl stop "${service}"
mv "${target}" "${backup}"
mv "${next}" "${target}"

if systemctl start "${service}" && sleep 4 && systemctl is-active --quiet "${service}"; then
  systemctl status "${service}" --no-pager
  echo "Renderer deployed. Backup: ${backup}"
  exit 0
fi

echo "The updated renderer did not become healthy; restoring the previous release." >&2
systemctl stop "${service}" || true
mv "${target}" "${workers_root}/clip-render-worker-failed-20260821"
mv "${backup}" "${target}"
systemctl start "${service}"
exit 1
