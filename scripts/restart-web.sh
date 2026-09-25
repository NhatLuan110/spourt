#!/usr/bin/env bash
# Restart the built Next.js server on port 3000.
set -u
PID=$(netstat -ano 2>/dev/null | grep ":3000 " | grep LISTENING | awk '{print $5}' | head -1)
if [ -n "${PID:-}" ]; then
  taskkill //F //PID "$PID" > /dev/null 2>&1 || true
  sleep 1
fi
(cd apps/web && node node_modules/next/dist/bin/next start --port 3000 > /tmp/web.log 2>&1 &)
for _ in $(seq 1 40); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 2 http://localhost:3000/ 2>/dev/null || echo 000)
  if [ "$CODE" != "000" ]; then
    echo "web: $CODE"
    exit 0
  fi
  sleep 1
done
echo "web did not start"
tail -20 /tmp/web.log
exit 1
