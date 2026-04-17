#!/bin/sh
set -e

mode="${1:-all}"

start_proxy() {
  cd /app
  exec node packages/cli/dist/index.js start
}

start_web() {
  cd /app/apps/web
  exec npx next start -H 0.0.0.0 -p 3000
}

case "$mode" in
  proxy)
    start_proxy
    ;;
  web|dashboard)
    start_web
    ;;
  all)
    ( start_web ) &
    web_pid=$!
    trap "kill $web_pid 2>/dev/null" INT TERM EXIT
    start_proxy
    ;;
  *)
    echo "Unknown mode: $mode (expected: all | proxy | web)" >&2
    exit 1
    ;;
esac
