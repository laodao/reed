#!/usr/bin/env bash
# 停止测试用 PostgreSQL Docker 容器
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-the-bot-test-pg}"

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "[test-pg-down] 停止 $CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" >/dev/null
else
  echo "[test-pg-down] 容器 $CONTAINER_NAME 不在运行"
fi
