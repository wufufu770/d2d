#!/usr/bin/env bash
# d2d v0.2.0+ thin wrapper — delegates to npm install of d2d-pentest package
set -euo pipefail
IFS=$'\n\t'

target_dir="${1:-$(pwd)}"
echo "[d2d] v0.2.0+ install (thin wrapper for monorepo)"
echo "[d2d] For full installation, use:"
echo ""
echo "  npm install -g @wufufu770/d2d-pentest"
echo ""
echo "Or in this monorepo for development:"
echo "  pnpm install"
echo "  pnpm test"
echo ""
echo "[d2d] install.sh is now a documentation stub."
echo "[d2d] See README.md and packages/*/README.md for details."
