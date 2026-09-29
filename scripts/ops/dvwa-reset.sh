#!/usr/bin/env bash
# scripts/ops/dvwa-reset.sh — DVWA 黄金靶场一键重置(4.5-0)
#
# 流程: ①docker restart dvwa + 循环探测 /login.php 200(30s 上限)
#       ②curl 流程登录 admin/password(GET /login.php 提取 user_token + PHPSESSID → POST 登录)
#       ③POST /setup.php create_db 重置 DB(需带 setup.php 页面签发的 user_token, 见 setup.php:13 checkToken)
#         + docker exec 清 /var/www/html/hackable/uploads/ 下 php/png/js 可疑残留文件(重置 DB 不删文件)
#         + docker exec service apache2 restart 确保无残留进程加载
#       ④尾部输出重置摘要(HTTP 状态、uploads 文件计数)
#
# 凭据说明: admin/password 是 DVWA 公开默认凭据(靶场专用, 非真实密钥), 允许写入本脚本。
# 重置效果: DB 回到出厂(users 表恢复 admin/password, 清掉历史注入数据); uploads 可疑文件清空;
#           不会删除 /hackable/uploads/ 下 jpg 等非 php/png/js 文件(按任务口径只删可疑类别)。
# 用法: bash scripts/ops/dvwa-reset.sh
# env : DVWA_CONTAINER(默认 dvwa)  DVWA_BASE_URL(默认 http://127.0.0.1)  DVWA_WAIT_TIMEOUT(默认 30)
set -euo pipefail

CONTAINER="${DVWA_CONTAINER:-dvwa}"
BASE_URL="${DVWA_BASE_URL:-http://127.0.0.1}"
WAIT_TIMEOUT="${DVWA_WAIT_TIMEOUT:-30}"
UPLOADS_DIR="/var/www/html/hackable/uploads"

log() { printf '[dvwa-reset] %s\n' "$*"; }

# ---- 前置检查: 容器在跑 ----
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  log "ERROR: 容器 $CONTAINER 不在运行(docker ps 无此名)。"
  exit 1
fi

JAR="$(mktemp)"   # cookie jar: PHPSESSID + security 全程复用
trap 'rm -f "$JAR"' EXIT

# ---- ① 重启容器 + 等待 /login.php 200 ----
log "① 重启容器 $CONTAINER ..."
docker restart "$CONTAINER" >/dev/null

code=""
deadline=$(( SECONDS + WAIT_TIMEOUT ))
while [ "$SECONDS" -lt "$deadline" ]; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/login.php" || true)"
  if [ "$code" = "200" ]; then
    log "① /login.php 返回 200(等待 ${SECONDS}s)。"
    break
  fi
  sleep 1
done
if [ "$code" != "200" ]; then
  log "ERROR: ${WAIT_TIMEOUT}s 内 /login.php 未达 200(最后状态: ${code:-无响应})。"
  exit 1
fi

# ---- ② 流程登录 admin/password(DVWA 公开默认凭据) ----
# GET /login.php → 从 HTML 提取 user_token(login.php:12 checkToken 校验), PHPSESSID 由 curl 落入 jar。
log "② 登录 DVWA(admin/password, 公开默认凭据) ..."
TOKEN="$(curl -s -c "$JAR" "$BASE_URL/login.php" | grep -oP "user_token' value='\K[^']+" | head -n1 || true)"
if [ -z "$TOKEN" ]; then
  log "ERROR: 未能从 /login.php 提取 user_token。"
  exit 1
fi
PHPSESSID="$(grep -oP 'PHPSESSID\s+\K\S+' "$JAR" | head -n1 || true)"

login_once() {
  local t="$1"
  curl -s -b "$JAR" -c "$JAR" -o /dev/null -w '%{http_code}' \
    --data "username=admin&password=password&user_token=${t}&Login=Login" \
    "$BASE_URL/login.php"
}
LOGIN_CODE="$(login_once "$TOKEN")"
# DB 刚重启时 MariaDB 可能未就绪: 登录失败则等 3s 重试一次
if ! curl -s -b "$JAR" "$BASE_URL/index.php" | grep -q 'Logout'; then
  sleep 3
  TOKEN="$(curl -s -b "$JAR" -c "$JAR" "$BASE_URL/login.php" | grep -oP "user_token' value='\K[^']+" | head -n1 || true)"
  if [ -n "$TOKEN" ]; then LOGIN_CODE="$(login_once "$TOKEN")"; fi
fi
# 登录判据: index.php 菜单的 Logout 仅在 dvwaIsLoggedIn() 时渲染(dvwaPage.inc.php:222-226)
if curl -s -b "$JAR" "$BASE_URL/index.php" | grep -q 'Logout'; then
  LOGIN_STATUS="ok(POST=$LOGIN_CODE, PHPSESSID=${PHPSESSID:-未知})"
else
  LOGIN_STATUS="fail(POST=$LOGIN_CODE) — 不阻断: setup.php 重置本身不依赖登录态"
fi
log "② 登录: $LOGIN_STATUS"

# ---- ③ 重置 DB(setup.php create_db 需页面 user_token) + 清 uploads 残留 + 重启 apache ----
log "③ 重置数据库(POST /setup.php create_db) ..."
SETUP_TOKEN="$(curl -s -b "$JAR" -c "$JAR" "$BASE_URL/setup.php" | grep -oP "user_token' value='\K[^']+" | head -n1 || true)"
if [ -z "$SETUP_TOKEN" ]; then
  log "ERROR: 未能从 /setup.php 提取 user_token(setup.php:13 checkToken 必需)。"
  exit 1
fi
RESET_BODY="$(curl -s -L -b "$JAR" -c "$JAR" \
  --data "create_db=Create / Reset Database&user_token=${SETUP_TOKEN}" \
  "$BASE_URL/setup.php" || true)"
if printf '%s' "$RESET_BODY" | grep -q 'Database has been created'; then
  RESET_STATUS='ok("Database has been created." — MySQL.php:32)'
else
  log "ERROR: 重置响应未含成功标记, setup.php 摘要如下:"
  printf '%s\n' "$RESET_BODY" | grep -oP '(?<=<li>).*?(?=</li>)' | head -5 || true
  exit 1
fi
log "③ DB 重置: $RESET_STATUS"

# 清 uploads 可疑残留(重置 DB 不删文件 — webshell 在容器文件系统):
# 只删 php 家族(php/php5/phtml) + png + js 可疑文件, 保留目录与 jpg 等其余文件(任务口径)。
COUNT_BEFORE="$(docker exec "$CONTAINER" sh -c "ls -A '$UPLOADS_DIR' 2>/dev/null | wc -l" || echo 0)"
docker exec "$CONTAINER" sh -c "rm -f '$UPLOADS_DIR'/*.php '$UPLOADS_DIR'/*.php5 '$UPLOADS_DIR'/*.phtml '$UPLOADS_DIR'/*.png '$UPLOADS_DIR'/*.js 2>/dev/null || true"
COUNT_AFTER="$(docker exec "$CONTAINER" sh -c "ls -A '$UPLOADS_DIR' 2>/dev/null | wc -l" || echo 0)"
log "③ uploads 清理: ${COUNT_BEFORE} → ${COUNT_AFTER} 个文件(仅删 php/php5/phtml/png/js)。"

log "③ 重启 apache(service apache2 restart)确保无残留进程加载 ..."
APACHE_OK=1
docker exec "$CONTAINER" service apache2 restart >/dev/null 2>&1 || APACHE_OK=0
if [ "$APACHE_OK" = "1" ]; then
  log "③ apache 重启: ok"
else
  log "WARN: service apache2 restart 返回非零(容器内服务管理差异), 以下最终探测仍会验证可用性。"
fi

# apache 重启后短暂等待, 最终可用性探测(15s 上限)
code=""
deadline=$(( SECONDS + 15 ))
while [ "$SECONDS" -lt "$deadline" ]; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/login.php" || true)"
  [ "$code" = "200" ] && break
  sleep 1
done

# ---- ④ 重置摘要 ----
FINAL_COUNT="$(docker exec "$CONTAINER" sh -c "ls -A '$UPLOADS_DIR' 2>/dev/null | wc -l" || echo 0)"
echo "==== DVWA 重置摘要 ===="
echo "容器: $CONTAINER (restart=ok)"
echo "登录: $LOGIN_STATUS"
echo "DB 重置: $RESET_STATUS"
echo "uploads 文件计数: 清理前=${COUNT_BEFORE} 清理后=${FINAL_COUNT}(php/php5/phtml/png/js 已删)"
echo "apache 重启: $([ "$APACHE_OK" = "1" ] && echo ok || echo '非零(见上)')"
echo "最终 HTTP 状态 /login.php: ${code:-000}"
if [ "$code" != "200" ]; then
  log "ERROR: 重置后靶场未恢复 200。"
  exit 1
fi
log "重置完成。"
