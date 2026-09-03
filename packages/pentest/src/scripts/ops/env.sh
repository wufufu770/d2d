# d2d 隔离环境 - source ~/d2d/env.sh  (或 source $HOME/d2d/env.sh)
export D2D="${D2D:-$HOME/d2d}"
export PATH="$D2D/dsh/node_modules/.bin:$PATH"
export DSH_HOME="$D2D/home/.dsh"
export P2P_GRAPHD="http://127.0.0.1:8766"
export P2P_DSH_BIN="$D2D/dsh/node_modules/.bin/dsh"
export P2P_DSH_HOME="$DSH_HOME"
alias d2d-graphd='python3 $D2D/graphd/app.py'
echo "[d2d] dsh=$D2D/dsh/node_modules/.bin/dsh | DSH_HOME=$DSH_HOME | graphd=:8766"
