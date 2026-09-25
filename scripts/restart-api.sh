#!/usr/bin/env bash
# Restart the built API on port 4000, replacing whatever holds the port.
set -u
PID=$(netstat -ano 2>/dev/null | grep ":4000 " | grep LISTENING | awk '{print $5}' | head -1)
if [ -n "${PID:-}" ]; then
  taskkill //F //PID "$PID" > /dev/null 2>&1 || true
  sleep 1
fi
(node apps/api/dist/main.js > /tmp/api.log 2>&1 &)
for _ in $(seq 1 30); do
  if curl -s -m 2 http://localhost:4000/readyz > /dev/null 2>&1; then
    curl -s http://localhost:4000/readyz
    echo
    exit 0
  fi
  sleep 1
done
echo "API did not become ready"
tail -20 /tmp/api.log
exit 1
