#!/usr/bin/env bash
# 启动测试用 PostgreSQL Docker 容器
# 已存在同名容器则跳过启动；通过环境变量 PGHOST/PGPORT 覆盖默认值。
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-the-bot-test-pg}"
PG_PORT="${PGPORT:-5432}"
PG_PASSWORD="${PGPASSWORD:-postgres}"
PG_DATABASE="${PGDATABASE:-the_bot_test}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "[test-pg-up] 容器 $CONTAINER_NAME 已在运行，跳过启动"
  exit 0
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "[test-pg-up] 移除已停止的旧容器 $CONTAINER_NAME"
  docker rm "$CONTAINER_NAME" >/dev/null
fi

echo "[test-pg-up] 启动 $CONTAINER_NAME (port=$PG_PORT, db=$PG_DATABASE)"
docker run -d --rm --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB="$PG_DATABASE" \
  -p "$PG_PORT:5432" \
  "$PG_IMAGE" >/dev/null

echo "[test-pg-up] 等待 PostgreSQL 就绪..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; then
    echo "[test-pg-up] 就绪"
    exit 0
  fi
  sleep 1
done

echo "[test-pg-up] PostgreSQL 30s 未就绪，启动失败" >&2
exit 1
