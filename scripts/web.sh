#!/usr/bin/env bash
# Web 端开发服务管理脚本（后端 tsx watch + 前端 vite dev）
#
# 用法：
#   bash scripts/web.sh start|stop|restart|status|logs [server|client|all]
#
# 默认 target=all。logs 默认 tail server，写 client 时跟 client。
#
# 环境变量（带默认值）：
#   PORT_SERVER  / WEB_SERVER_PORT      默认 4201
#   PORT_CLIENT  / WEB_CLIENT_PORT      默认 5174
#   DATA_ROOT                            默认 ./data-web
#   JWT_SECRET                           默认 dev-only-secret-do-not-use-in-prod
#   JWT_COOKIE_NAME                      默认 tb_session_dev（与 staging 默认 tb_session 区分，避免同机互踢）
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE  默认 localhost/5432/postgres/postgres/the_bot_web

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ---------- 配置 ----------
PORT_SERVER="${WEB_SERVER_PORT:-${PORT_SERVER:-4201}}"
PORT_CLIENT="${WEB_CLIENT_PORT:-${PORT_CLIENT:-5174}}"
DATA_ROOT_VAL="${DATA_ROOT:-./data-web}"
JWT_SECRET_VAL="${JWT_SECRET:-dev-only-secret-do-not-use-in-prod}"
JWT_COOKIE_NAME_VAL="${JWT_COOKIE_NAME:-tb_session_dev}"
PGHOST_VAL="${PGHOST:-localhost}"
PGPORT_VAL="${PGPORT:-5432}"
PGUSER_VAL="${PGUSER:-postgres}"
PGPASSWORD_VAL="${PGPASSWORD:-postgres}"
PGDATABASE_VAL="${PGDATABASE:-the_bot_web}"

RUN_DIR="$PROJECT_ROOT/.run"
mkdir -p "$RUN_DIR"
SERVER_PID_FILE="$RUN_DIR/server.pid"
CLIENT_PID_FILE="$RUN_DIR/client.pid"
SERVER_LOG="$RUN_DIR/server.log"
CLIENT_LOG="$RUN_DIR/client.log"

# 用于 pkill 精确匹配的指纹（避免误杀同机器其他 tsx/vite）
SERVER_FP="src/web/server/index.ts"
CLIENT_FP="vite.config.web.ts"

# ---------- 颜色 ----------
if [[ -t 1 ]]; then
  C_BOLD="\033[1m"; C_DIM="\033[2m"; C_GREEN="\033[32m"; C_RED="\033[31m"
  C_YELLOW="\033[33m"; C_RESET="\033[0m"
else
  C_BOLD=""; C_DIM=""; C_GREEN=""; C_RED=""; C_YELLOW=""; C_RESET=""
fi

log()  { echo -e "${C_DIM}[web.sh]${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}[web.sh] ✓ $*${C_RESET}"; }
warn() { echo -e "${C_YELLOW}[web.sh] ! $*${C_RESET}"; }
err()  { echo -e "${C_RED}[web.sh] ✗ $*${C_RESET}" >&2; }

# ---------- 工具 ----------
is_pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  [[ -f "$file" ]] || { echo ""; return; }
  cat "$file" 2>/dev/null || echo ""
}

port_listening() {
  local port="$1"
  ss -ltn 2>/dev/null | awk -v p=":$port" '$4 ~ p {found=1} END{exit !found}'
}

# ---------- 启动 ----------
start_server() {
  local pid
  pid="$(read_pid "$SERVER_PID_FILE")"
  if is_pid_alive "$pid"; then
    warn "server 已在运行 (pid=$pid, port=$PORT_SERVER)"
    return 0
  fi
  if port_listening "$PORT_SERVER"; then
    err "端口 $PORT_SERVER 被其他进程占用，先释放或改 PORT_SERVER"
    return 1
  fi

  log "启动 server: tsx watch src/web/server/index.ts (port=$PORT_SERVER, host=0.0.0.0)"
  : > "$SERVER_LOG"
  # nohup + setsid 让进程脱离当前 shell 进程组，便于按指纹 pkill
  # node http.Server.listen(port) 默认就 bind 0.0.0.0；显式传 HOST 仅作文档化
  nohup setsid env \
    DATA_ROOT="$DATA_ROOT_VAL" \
    JWT_SECRET="$JWT_SECRET_VAL" \
    JWT_COOKIE_NAME="$JWT_COOKIE_NAME_VAL" \
    PGHOST="$PGHOST_VAL" PGPORT="$PGPORT_VAL" \
    PGUSER="$PGUSER_VAL" PGPASSWORD="$PGPASSWORD_VAL" \
    PGDATABASE="$PGDATABASE_VAL" \
    PORT="$PORT_SERVER" \
    HOST="0.0.0.0" \
    npm run web:dev \
    >>"$SERVER_LOG" 2>&1 &
  echo $! > "$SERVER_PID_FILE"

  # 等监听端口
  for _ in $(seq 1 30); do
    if port_listening "$PORT_SERVER"; then
      local lan_ip
      lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
      ok "server 启动成功 → http://localhost:$PORT_SERVER  (LAN: http://${lan_ip}:$PORT_SERVER)"
      log "log: $SERVER_LOG"
      return 0
    fi
    sleep 1
  done
  err "server 30s 内未监听端口，查看日志：tail -f $SERVER_LOG"
  return 1
}

start_client() {
  local pid
  pid="$(read_pid "$CLIENT_PID_FILE")"
  if is_pid_alive "$pid"; then
    warn "client 已在运行 (pid=$pid, port=$PORT_CLIENT)"
    return 0
  fi
  if port_listening "$PORT_CLIENT"; then
    err "端口 $PORT_CLIENT 被其他进程占用，先释放或改 PORT_CLIENT"
    return 1
  fi

  log "启动 client: vite (port=$PORT_CLIENT, host=0.0.0.0, proxy → :$PORT_SERVER)"
  : > "$CLIENT_LOG"
  # --host 0.0.0.0 让 LAN 其他设备能访问（默认仅 localhost）
  nohup setsid env \
    PORT_CLIENT="$PORT_CLIENT" \
    npm run web:client:dev -- --port "$PORT_CLIENT" --host 0.0.0.0 \
    >>"$CLIENT_LOG" 2>&1 &
  echo $! > "$CLIENT_PID_FILE"

  for _ in $(seq 1 30); do
    if port_listening "$PORT_CLIENT"; then
      local lan_ip
      lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
      ok "client 启动成功 → http://localhost:$PORT_CLIENT  (LAN: http://${lan_ip}:$PORT_CLIENT)"
      log "log: $CLIENT_LOG"
      return 0
    fi
    sleep 1
  done
  err "client 30s 内未监听端口，查看日志：tail -f $CLIENT_LOG"
  return 1
}

# ---------- 停止 ----------
# 双保险：先按 PID 文件 SIGTERM 整个进程组，再按指纹 pkill 兜底（避免 tsx watch 派生的子进程残留）
stop_one() {
  local label="$1" pid_file="$2" fingerprint="$3" port="$4"
  local pid
  pid="$(read_pid "$pid_file")"

  if is_pid_alive "$pid"; then
    log "停止 $label (pid=$pid)"
    # 杀整个进程组（前面用 setsid 启的，pgid == pid）
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    sleep 1
    if is_pid_alive "$pid"; then
      kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$pid_file"

  # 兜底：如果还有按指纹匹配的进程（比如手动启过 / pid 文件丢了）
  if pgrep -f "$fingerprint" >/dev/null 2>&1; then
    log "$label 仍有遗留进程，按指纹清理"
    pkill -TERM -f "$fingerprint" 2>/dev/null || true
    sleep 1
    pkill -KILL -f "$fingerprint" 2>/dev/null || true
  fi

  if port_listening "$port"; then
    warn "$label 端口 $port 仍被占用（可能是其他进程）"
  else
    ok "$label 已停止"
  fi
}

stop_server() { stop_one "server" "$SERVER_PID_FILE" "$SERVER_FP" "$PORT_SERVER"; }
stop_client() { stop_one "client" "$CLIENT_PID_FILE" "$CLIENT_FP" "$PORT_CLIENT"; }

# ---------- 状态 ----------
status_one() {
  local label="$1" pid_file="$2" port="$3" url="$4"
  local pid status
  pid="$(read_pid "$pid_file")"
  if is_pid_alive "$pid" && port_listening "$port"; then
    status="${C_GREEN}RUNNING${C_RESET}  pid=$pid  port=$port  $url"
  elif is_pid_alive "$pid"; then
    status="${C_YELLOW}ALIVE-NO-PORT${C_RESET}  pid=$pid（启动中或未监听 $port）"
  elif port_listening "$port"; then
    status="${C_YELLOW}PORT-USED${C_RESET}  port=$port 被占用但 pid 文件无对应进程"
  else
    status="${C_DIM}STOPPED${C_RESET}"
  fi
  printf "  %-7s  %b\n" "$label" "$status"
}

cmd_status() {
  echo -e "${C_BOLD}Web 服务状态：${C_RESET}"
  local lan_ip
  lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  status_one "server" "$SERVER_PID_FILE" "$PORT_SERVER" "http://localhost:$PORT_SERVER"
  status_one "client" "$CLIENT_PID_FILE" "$PORT_CLIENT" "http://localhost:$PORT_CLIENT"
  if [[ -n "$lan_ip" ]]; then
    echo -e "  ${C_DIM}LAN 访问 → http://${lan_ip}:$PORT_CLIENT  (server: http://${lan_ip}:$PORT_SERVER)${C_RESET}"
  fi
}

# ---------- logs ----------
cmd_logs() {
  local target="${1:-server}"
  case "$target" in
    server) tail -f "$SERVER_LOG" ;;
    client) tail -f "$CLIENT_LOG" ;;
    *) err "logs 只支持 server / client"; exit 1 ;;
  esac
}

# ---------- 派发 ----------
action="${1:-}"
target="${2:-all}"

case "$action" in
  start)
    case "$target" in
      server) start_server ;;
      client) start_client ;;
      all)    start_server && start_client ;;
      *) err "未知 target: $target"; exit 1 ;;
    esac
    cmd_status
    ;;
  stop)
    case "$target" in
      server) stop_server ;;
      client) stop_client ;;
      all)    stop_client; stop_server ;;
      *) err "未知 target: $target"; exit 1 ;;
    esac
    ;;
  restart)
    case "$target" in
      server) stop_server; start_server ;;
      client) stop_client; start_client ;;
      all)    stop_client; stop_server; start_server; start_client ;;
      *) err "未知 target: $target"; exit 1 ;;
    esac
    cmd_status
    ;;
  status) cmd_status ;;
  logs)   cmd_logs "$target" ;;
  *)
    cat <<EOF
${C_BOLD}用法：${C_RESET}
  bash scripts/web.sh start   [server|client|all]   启动（默认 all）
  bash scripts/web.sh stop    [server|client|all]   停止（默认 all）
  bash scripts/web.sh restart [server|client|all]   重启（默认 all）
  bash scripts/web.sh status                         查看状态
  bash scripts/web.sh logs    [server|client]       tail 日志（默认 server）

${C_BOLD}环境变量（可在调用前 export）：${C_RESET}
  WEB_SERVER_PORT=$PORT_SERVER  WEB_CLIENT_PORT=$PORT_CLIENT
  DATA_ROOT=$DATA_ROOT_VAL      JWT_SECRET=*** (默认开发期)
  PGHOST=$PGHOST_VAL  PGPORT=$PGPORT_VAL
  PGUSER=$PGUSER_VAL  PGPASSWORD=*** (默认 postgres)
  PGDATABASE=$PGDATABASE_VAL

${C_BOLD}日志路径：${C_RESET} $SERVER_LOG / $CLIENT_LOG
${C_BOLD}PID 路径：${C_RESET} $SERVER_PID_FILE / $CLIENT_PID_FILE
EOF
    exit 1
    ;;
esac
