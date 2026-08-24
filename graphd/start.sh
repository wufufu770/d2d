#!/usr/bin/env bash
# d2d graphd 启动器
cd "$(dirname "$0")"
export P2P_GRAPH_PORT=8766
unset P2P_GRAPH
exec python3 app.py
