#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
run_dir="$repo_root/.run"
log_dir="$repo_root/logs"
app_pid_file="$run_dir/guixiaoya.pid"
supervisor_pid_file="$run_dir/guixiaoya-supervisor.pid"
log_file="${GUIXIAOYA_LOG_FILE:-$log_dir/guixiaoya.log}"
service_script="$repo_root/scripts/run-workbuddy-service.sh"
screen_session="${GUIXIAOYA_SCREEN_SESSION:-guixiaoya-workbuddy}"

read_env_value() {
  local key="$1"
  [[ -f "$repo_root/.env" ]] || return 1
  awk -F= -v key="$key" '
    $1 == key {
      value = $0
      sub("^[^=]*=", "", value)
      gsub(/^"|"$/, "", value)
      print value
      exit
    }
  ' "$repo_root/.env"
}

port="${PORT:-$(read_env_value PORT || true)}"
host="${HOST:-$(read_env_value HOST || true)}"
port="${port:-8787}"
host="${host:-127.0.0.1}"
display_host="$host"
if [[ "$display_host" == "0.0.0.0" ]]; then
  display_host="127.0.0.1"
fi
health_url="http://$display_host:$port/api/health"
page_url="http://$display_host:$port"

is_pid_alive() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  tr -d '[:space:]' < "$file"
}

supervisor_pid() {
  read_pid "$supervisor_pid_file" 2>/dev/null || true
}

app_pid() {
  read_pid "$app_pid_file" 2>/dev/null || true
}

pid_command() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null || true
}

direct_supervisor_pids() {
  local pid
  local command_text
  for pid in $(pgrep -f "$service_script" 2>/dev/null || true); do
    command_text="$(pid_command "$pid")"
    if [[ "$command_text" == "bash $service_script"* ]]; then
      echo "$pid"
    fi
  done
}

line_count() {
  local value="$1"
  if [[ -z "$value" ]]; then
    echo 0
    return
  fi
  printf '%s\n' $value | wc -l | tr -d '[:space:]'
}

has_screen_session() {
  command -v screen >/dev/null 2>&1 && (screen -ls 2>/dev/null || true) | grep -Fq ".$screen_session"
}

listener_pids() {
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
}

is_project_pid() {
  local pid="$1"
  local command
  command="$(pid_command "$pid")"
  [[ "$command" == *"$repo_root"* ]] || [[ "$command" == *"server/index.ts"* ]]
}

stop_project_listeners() {
  local pid
  for pid in $(listener_pids); do
    if is_project_pid "$pid"; then
      echo "Stopping existing project listener on port $port (pid $pid)..."
      kill "$pid" 2>/dev/null || true
    fi
  done
}

wait_for_health() {
  local attempts="${1:-45}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$health_url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

print_status() {
  local supervisor
  local app
  supervisor="$(direct_supervisor_pids)"
  app="$(app_pid)"
  local listeners
  listeners="$(listener_pids)"

  if has_screen_session; then
    echo "Guixiaoya screen: running ($screen_session)"
  else
    echo "Guixiaoya screen: stopped"
  fi

  if [[ -n "$supervisor" ]]; then
    echo "Guixiaoya supervisor: running (pid $(printf '%s' "$supervisor" | tr '\n' ' ' | xargs))"
  else
    echo "Guixiaoya supervisor: stopped"
  fi

  if is_pid_alive "$app"; then
    echo "Guixiaoya service: running (pid $app)"
  elif [[ -n "$listeners" ]]; then
    echo "Guixiaoya service: running (listener pid $(printf '%s' "$listeners" | tr '\n' ' ' | xargs))"
  else
    echo "Guixiaoya service: stopped or starting"
  fi

  if curl -fsS "$health_url" >/dev/null 2>&1; then
    echo "Health: ok"
    echo "Open: $page_url"
  else
    echo "Health: not ready"
  fi
  echo "Log: $log_file"
}

start_service() {
  mkdir -p "$run_dir" "$log_dir"
  local supervisor
  supervisor="$(direct_supervisor_pids)"
  local supervisor_count
  supervisor_count="$(line_count "$supervisor")"
  if [[ "$supervisor_count" == "1" ]] && has_screen_session && curl -fsS "$health_url" >/dev/null 2>&1; then
    echo "Guixiaoya is already running."
    print_status
    return 0
  fi
  if [[ "$supervisor_count" != "0" ]] || has_screen_session; then
    echo "Cleaning stale or duplicate Guixiaoya supervisors..."
    stop_service
  fi

  local listeners
  listeners="$(listener_pids)"
  if [[ -n "$listeners" ]]; then
    local only_project_listeners="1"
    local pid
    for pid in $listeners; do
      if ! is_project_pid "$pid"; then
        only_project_listeners="0"
      fi
    done

    if [[ "$only_project_listeners" == "1" ]]; then
      stop_project_listeners
      sleep 1
    else
      echo "Port $port is already used by another process:"
      lsof -n -P -iTCP:"$port" -sTCP:LISTEN || true
      exit 1
    fi
  fi

  echo "Starting Guixiaoya single-port service for WorkBuddy..."
  echo "Log: $log_file"
  : > "$log_file"
  if command -v screen >/dev/null 2>&1; then
    local command_text
    printf -v command_text "cd %q && env PORT=%q HOST=%q bash %q >> %q 2>&1" "$repo_root" "$port" "$host" "$service_script" "$log_file"
    screen -dmS "$screen_session" bash -lc "$command_text"
  else
    nohup env PORT="$port" HOST="$host" bash "$service_script" >> "$log_file" 2>&1 &
    echo "$!" > "$supervisor_pid_file"
  fi

  if wait_for_health 60; then
    echo "Started: $page_url"
  else
    echo "Service is still starting. Check logs with: ./start.sh logs"
  fi
  print_status
}

stop_service() {
  local supervisor
  local app
  supervisor="$(direct_supervisor_pids)"
  app="$(app_pid)"

  local pid
  for pid in $supervisor; do
    if is_pid_alive "$pid"; then
      echo "Stopping supervisor pid $pid..."
      kill "$pid" 2>/dev/null || true
    fi
  done
  if is_pid_alive "$app"; then
    echo "Stopping service pid $app..."
    kill "$app" 2>/dev/null || true
  fi
  if has_screen_session; then
    echo "Stopping screen session $screen_session..."
    screen -S "$screen_session" -X quit >/dev/null 2>&1 || true
  fi
  stop_project_listeners

  for _ in $(seq 1 20); do
    if [[ -z "$(direct_supervisor_pids)" ]] && ! is_pid_alive "$app" && ! has_screen_session; then
      break
    fi
    sleep 0.5
  done

  rm -f "$supervisor_pid_file" "$app_pid_file"
  echo "Stopped."
}

show_logs() {
  mkdir -p "$log_dir"
  touch "$log_file"
  tail -n "${LOG_LINES:-120}" -f "$log_file"
}

command="${1:-start}"
case "$command" in
  start)
    start_service
    ;;
  foreground)
    mkdir -p "$run_dir" "$log_dir"
    exec env PORT="$port" HOST="$host" bash "$service_script"
    ;;
  stop)
    stop_service
    ;;
  restart)
    stop_service
    start_service
    ;;
  status)
    print_status
    ;;
  logs)
    show_logs
    ;;
  *)
    echo "Usage: ./start.sh [start|foreground|stop|restart|status|logs]"
    exit 2
    ;;
esac
