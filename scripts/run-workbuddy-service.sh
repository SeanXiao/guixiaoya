#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_dir="$repo_root/.run"
app_pid_file="$run_dir/guixiaoya.pid"
supervisor_pid_file="$run_dir/guixiaoya-supervisor.pid"
restart_delay="${GUIXIAOYA_RESTART_DELAY:-3}"

cd "$repo_root"
mkdir -p "$run_dir"
echo "$$" > "$supervisor_pid_file"

child_pid=""
cleanup() {
  trap - INT TERM EXIT
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  rm -f "$app_pid_file" "$supervisor_pid_file"
}
trap cleanup INT TERM EXIT

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Guixiaoya supervisor started"

if [[ ! -d node_modules ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] node_modules missing, running npm install"
  npm install
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Building frontend"
npm run build

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting single-port service on ${HOST:-127.0.0.1}:${PORT:-8787}"
  npm run api &
  child_pid="$!"
  echo "$child_pid" > "$app_pid_file"

  set +e
  wait "$child_pid"
  status="$?"
  set -e
  child_pid=""
  rm -f "$app_pid_file"

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Service exited with status $status"
  if [[ "${GUIXIAOYA_NO_RESTART:-0}" == "1" ]]; then
    exit "$status"
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting in ${restart_delay}s"
  sleep "$restart_delay"
done
