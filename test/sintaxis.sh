#!/usr/bin/env bash
# Valida cada módulo como módulo ES de verdad. `node --check` a secas trata el
# archivo como script clásico, y ahí cosas como declarar dos veces la misma
# función son legales — justo el error que se come el navegador al cargar.
set -e
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd "$(dirname "$0")/.."
for f in js/*.js; do
  cp "$f" "$tmp/$(basename "${f%.js}").mjs"
  node --check "$tmp/$(basename "${f%.js}").mjs" || { echo "FALLA: $f"; exit 1; }
done
echo "todos los módulos OK"
