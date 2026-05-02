#!/usr/bin/env bash
# Web 端 staging 环境（Docker）编排
# - app: the-bot-staging-app  → http://localhost:4291
# - pg : the-bot-staging-pg   → localhost:5433  (库 the_bot_web)
#
# 与 dev 完全隔离：
#   dev app   = port 4201 / vite 5174
#   dev pg    = port 5432 (容器 the-bot-test-pg)
#
# 用法：
#   bash scripts/staging.sh build              # docker compose build
#   bash scripts/staging.sh up                 # build + up -d
#   bash scripts/staging.sh down               # stop + remove（数据保留）
#   bash scripts/staging.sh down --volumes     # 连同数据卷一起删
#   bash scripts/staging.sh restart [app|pg|all]
#   bash scripts/staging.sh status
#   bash scripts/staging.sh logs   [app|pg]
#   bash scripts/staging.sh psql                                  # 进 staging pg shell
#   bash scripts/staging.sh restore-pg [SOURCE_CONTAINER]
#                                              # 把 SOURCE_CONTAINER 的 the_bot_web
#                                              # 全量复制到 staging-pg
#                                              # 默认 SOURCE_CONTAINER=the-bot-test-pg

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE_FILE="docker-compose.staging.yml"
APP_CONTAINER="the-bot-staging-app"
PG_CONTAINER="the-bot-staging-pg"
SOURCE_PG_DEFAULT="the-bot-test-pg"
APP_PORT=4291
PG_PORT=5433

# ---------- 颜色 ----------
if [[ -t 1 ]]; then
  BOLD="\033[1m"; DIM="\033[2m"; GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; RESET="\033[0m"
else
  BOLD=""; DIM=""; GREEN=""; RED=""; YELLOW=""; RESET=""
fi

log()  { echo -e "${DIM}[staging]${RESET} $*"; }
ok()   { echo -e "${GREEN}[staging] ✓${RESET} $*"; }
warn() { echo -e "${YELLOW}[staging] !${RESET} $*"; }
err()  { echo -e "${RED}[staging] ✗${RESET} $*" >&2; }

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

cmd_build() {
  log "构建镜像（首次约 5-10 分钟，含 npm ci + native rebuild + vite build）"
  dc build
  ok "镜像构建完成"
}

cmd_up() {
  cmd_build
  log "启动 staging 容器"
  dc up -d
  ok "已启动 → http://localhost:$APP_PORT  (pg @ localhost:$PG_PORT)"
  cmd_status
}

cmd_down() {
  if [[ "${1:-}" == "--volumes" ]]; then
    warn "连同数据卷一起删除（renmadao 数据将丢失）"
    dc down --volumes
  else
    dc down
  fi
  ok "已停止"
}

cmd_restart() {
  local target="${1:-all}"
  case "$target" in
    app) dc restart app ;;
    pg)  dc restart postgres ;;
    all) dc restart ;;
    *) err "未知 target: $target"; exit 1 ;;
  esac
  cmd_status
}

cmd_status() {
  echo -e "${BOLD}staging 服务状态：${RESET}"
  dc ps
  echo
  if curl -sf "http://localhost:$APP_PORT/api/health" >/dev/null 2>&1; then
    ok "app 健康检查通过：http://localhost:$APP_PORT/api/health"
  else
    warn "app 健康检查失败（容器可能还在启动）"
  fi
}

cmd_logs() {
  local target="${1:-app}"
  case "$target" in
    app) dc logs -f app ;;
    pg)  dc logs -f postgres ;;
    *) err "logs 只支持 app / pg"; exit 1 ;;
  esac
}

cmd_psql() {
  docker exec -it "$PG_CONTAINER" psql -U postgres -d the_bot_web
}

cmd_restore_pg() {
  local source="${1:-$SOURCE_PG_DEFAULT}"
  if ! docker ps --format '{{.Names}}' | grep -qx "$source"; then
    err "源容器 $source 未运行（或不存在）"
    exit 1
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    err "目标容器 $PG_CONTAINER 未运行；先 bash scripts/staging.sh up"
    exit 1
  fi

  log "源 PG: $source"
  log "目标 PG: $PG_CONTAINER"
  log "源库 → 目标库: the_bot_web → the_bot_web"

  # 1. 在目标 PG 上：DROP DATABASE 重建（用 postgres 库做 admin）
  log "目标库 the_bot_web 重建（DROP + CREATE）"
  docker exec "$PG_CONTAINER" psql -U postgres -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='the_bot_web' AND pid<>pg_backend_pid();" \
    >/dev/null
  docker exec "$PG_CONTAINER" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS the_bot_web;" >/dev/null
  docker exec "$PG_CONTAINER" psql -U postgres -d postgres -c "CREATE DATABASE the_bot_web;" >/dev/null

  # 2. pg_dump 源库 → 管道 → pg_restore 到目标
  log "pg_dump → pg_restore（custom 格式，全量）"
  docker exec "$source" pg_dump -U postgres -d the_bot_web -Fc --no-owner --no-privileges \
    | docker exec -i "$PG_CONTAINER" pg_restore -U postgres -d the_bot_web --no-owner --no-privileges -v 2>&1 \
    | tail -10

  # 3. 校验
  log "校验：列出目标库主要表行数"
  docker exec "$PG_CONTAINER" psql -U postgres -d the_bot_web -c "
    SELECT 'users'    AS t, COUNT(*)::int FROM users
    UNION ALL SELECT 'dialogs',           COUNT(*)::int FROM dialogs
    UNION ALL SELECT 'messages',          COUNT(*)::int FROM messages
    UNION ALL SELECT 'roles',             COUNT(*)::int FROM roles
    UNION ALL SELECT 'provider_configs',  COUNT(*)::int FROM provider_configs
    ORDER BY t;
  "
  ok "复制完成"
  log "提示：app 容器已经连着这个 PG，对话历史等会立刻可见。如需重启 app 清缓存：bash scripts/staging.sh restart app"
}

# ---------- 派发 ----------
action="${1:-}"
shift || true
case "$action" in
  build)      cmd_build ;;
  up)         cmd_up ;;
  down)       cmd_down "$@" ;;
  restart)    cmd_restart "$@" ;;
  status)     cmd_status ;;
  logs)       cmd_logs "$@" ;;
  psql)       cmd_psql ;;
  restore-pg) cmd_restore_pg "$@" ;;
  *)
    cat <<EOF
${BOLD}用法：${RESET}
  bash scripts/staging.sh build               构建镜像
  bash scripts/staging.sh up                  build + 启动 (app=$APP_PORT, pg=$PG_PORT)
  bash scripts/staging.sh down [--volumes]    停止；--volumes 同时删数据卷
  bash scripts/staging.sh restart [app|pg|all]
  bash scripts/staging.sh status              ps + 健康检查
  bash scripts/staging.sh logs   [app|pg]     tail 日志
  bash scripts/staging.sh psql                进 staging PG 的 psql shell
  bash scripts/staging.sh restore-pg [SRC]    SRC 默认 the-bot-test-pg
                                              全量复制 the_bot_web

${BOLD}容器名：${RESET} $APP_CONTAINER / $PG_CONTAINER
${BOLD}端口：${RESET} app http://localhost:$APP_PORT  pg localhost:$PG_PORT
${BOLD}与 dev 完全隔离：${RESET} dev app=4201 vite=5174 pg=5432
EOF
    exit 1
    ;;
esac
