#!/bin/zsh
set -eu
DAWN_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$DAWN_ROOT"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print '需要 Node.js 22.13 或更高版本。'; read -r '?按回车退出'; exit 1
fi
if curl --noproxy 127.0.0.1,localhost -fsS http://127.0.0.1:8178/health >/dev/null 2>&1; then
  open http://127.0.0.1:8178
  exit 0
fi
if [[ ! -d node_modules/ws ]]; then npm ci --ignore-scripts; fi
if [[ ! -f client/dist/index.html || ! -f packages/simulation/dist/index.js ]]; then npm run build; fi
node server/server.cjs &
DAWN_PID=$!
trap 'kill "$DAWN_PID" 2>/dev/null || true' EXIT INT TERM
for DAWN_ATTEMPT in {1..30}; do
  if curl --noproxy 127.0.0.1,localhost -fsS http://127.0.0.1:8178/health >/dev/null 2>&1; then open http://127.0.0.1:8178; break; fi
  sleep 0.2
done
wait "$DAWN_PID"
