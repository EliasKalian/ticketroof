#!/bin/sh
# Builds the deployable site into _site/. Pass --drafts to include draft posts (local preview only).
set -e
cd "$(dirname "$0")/.."

rm -rf _site
mkdir _site
rsync -a \
  --exclude .git --exclude .github --exclude _site --exclude node_modules \
  --exclude cloudflare --exclude scripts --exclude blog \
  --exclude package.json --exclude package-lock.json --exclude .DS_Store \
  ./ _site/

npx esbuild style.css --minify --outfile=_site/style.css --allow-overwrite --log-level=warning
npx esbuild main.js --minify --outfile=_site/main.js --allow-overwrite --log-level=warning

TZ=Europe/Vienna node scripts/build.mjs _site "$@"
