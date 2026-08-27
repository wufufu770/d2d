#!/usr/bin/env bash
cd "$(dirname "$0")"
export P2P_GRAPH_PORT="${P2P_GRAPH_PORT:-8766}"
export P2P_HOST_TOKEN_FILE="${P2P_HOST_TOKEN_FILE:-$HOME/.config/d2d/host-token}"
export P2P_WORKER_TOKEN_FILE="${P2P_WORKER_TOKEN_FILE:-$HOME/.config/d2d/worker-token}"
unset P2P_GRAPH
exec python3 app.py
