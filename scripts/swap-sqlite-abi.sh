#!/usr/bin/env bash
# 切换 better-sqlite3 的 ABI 副本（Electron v20 vs host Node v25）
# 用法：bash scripts/swap-sqlite-abi.sh electron | node
#
# 项目同时跑 PC（Electron 内嵌 Node v20，ABI 119）和 Web（host Node v25，ABI 141）
# better-sqlite3 是原生模块，编译后只匹配一个 ABI。每次 npm rebuild 太慢且需要工具链。
# 这里在 node_modules/better-sqlite3/build/Release/ 下保留两份预编译副本：
#   - better_sqlite3.node.electron     给 Electron 用
#   - better_sqlite3.node.host-node    给 host Node 用
# 切换时 cp 即可（毫秒级）。如果某份缺失，自动尝试 rebuild。
set -e

TARGET="$1"
RELEASE="node_modules/better-sqlite3/build/Release"
NODE_FILE="$RELEASE/better_sqlite3.node"
ELECTRON_BAK="$RELEASE/better_sqlite3.node.electron"
HOST_BAK="$RELEASE/better_sqlite3.node.host-node"

case "$TARGET" in
  electron)
    if [ ! -f "$ELECTRON_BAK" ]; then
      echo "[swap-sqlite-abi] 首次设置：rebuild 给 Electron 并备份"
      npx electron-builder install-app-deps
      cp "$NODE_FILE" "$ELECTRON_BAK"
    fi
    cp -f "$ELECTRON_BAK" "$NODE_FILE"
    echo "[swap-sqlite-abi] -> Electron ABI"
    ;;
  node)
    if [ ! -f "$HOST_BAK" ]; then
      echo "[swap-sqlite-abi] 首次设置：rebuild 给 host Node 并备份"
      npm rebuild better-sqlite3
      cp "$NODE_FILE" "$HOST_BAK"
    fi
    cp -f "$HOST_BAK" "$NODE_FILE"
    echo "[swap-sqlite-abi] -> host Node ABI"
    ;;
  *)
    echo "Usage: $0 electron | node" >&2
    exit 1
    ;;
esac
