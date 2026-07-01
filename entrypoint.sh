#!/bin/bash
set -e
echo "[entrypoint] Starting Capta Content Engine..."
echo "  node: $(node --version)"
echo "  cwd: $(pwd)"
echo "  files: $(ls -la)"
echo "  server.js exists: $(test -f server.js && echo yes || echo no)"
echo "  node_modules: $(ls -d node_modules 2>/dev/null && echo yes || echo no)"
exec node server.js