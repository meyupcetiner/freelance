#!/bin/sh
# Yerel geliştirme: derle ve sunucuyu yeniden başlat
pkill -f "dist/server.js" 2>/dev/null; sleep 0.3
node scripts/build.mjs >/dev/null 2>&1 || node scripts/build.mjs
(node --disable-warning=ExperimentalWarning --enable-source-maps dist/server.js > "${LOG:-/dev/null}" 2>&1 &)
sleep 1
