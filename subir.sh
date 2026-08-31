#!/usr/bin/env bash
# Crea el repo en GitHub y publica en GitHub Pages.
# Necesita la CLI de GitHub (gh). Si no la tenés: sudo pacman -S github-cli && gh auth login
set -e
gh repo create lexi --public --source=. --remote=origin \
  --description "Vocabulario de inglés con repetición espaciada, enfocado en el área tech. PWA, sin backend." \
  --push
gh api -X POST repos/fabricoronil/lexi/pages -f 'source[branch]=main' -f 'source[path]=/' || true
echo
echo "Listo. En un minuto va a estar en: https://fabricoronil.github.io/lexi/"
