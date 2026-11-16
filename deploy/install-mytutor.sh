#!/usr/bin/env bash
# MyTutor 服务器安装（root 运行）。包已解压到 /opt/mytutor-src。
# 不动任何现有服务；只新增 mytutor 用户/服务/目录。
set -euo pipefail
SRC=/opt/mytutor-src
DST=/opt/mytutor

id mytutor &>/dev/null || useradd --system --home-dir "$DST" --shell /usr/sbin/nologin mytutor
mkdir -p "$DST/data"
cp -r "$SRC/engine" "$SRC/app" "$DST/"
cp -rn "$SRC/data/packs" "$DST/data/" 2>/dev/null || true

if [ ! -x "$DST/venv/bin/python" ]; then
  python3 -m venv "$DST/venv"
fi
"$DST/venv/bin/pip" install -q -i https://pypi.tuna.tsinghua.edu.cn/simple -r "$SRC/requirements-server.txt"

# TypeScript 判题运行器（node24 专用目录，不动系统 node20）
/opt/node24/bin/npm i -g tsx --registry=https://registry.npmmirror.com || echo "WARN: tsx 安装失败，ts 判题将回退 npx"

# 沙箱：优先 bwrap（SYSTEM 隔离）；装不上/跑不了则受限子进程（APPLICATION 隔离，与本机一致）
apt-get install -y bubblewrap || echo "WARN: bubblewrap 安装失败"

chown -R mytutor:mytutor "$DST"

# 口令初始化（仅首次）：明文只留 /root/mytutor-password.txt（600）
if [ ! -f "$DST/data/auth.json" ]; then
  PW=$(openssl rand -base64 12)
  printf '%s\n' "$PW" > /root/mytutor-password.txt
  chmod 600 /root/mytutor-password.txt
  (cd "$DST/app" && MYTUTOR_DATA="$DST/data" PYTHONPATH="$DST/engine:$DST/app" \
    "$DST/venv/bin/python" -c "from server import auth; auth.set_password('$PW')")
  chown mytutor:mytutor "$DST/data/auth.json"
  echo "PASSWORD_INITIALIZED"
fi

cat > /etc/systemd/system/mytutor.service <<'EOF'
[Unit]
Description=MyTutor personal programming learning platform
After=network.target

[Service]
Type=simple
User=mytutor
WorkingDirectory=/opt/mytutor/app
Environment=MYTUTOR_DATA=/opt/mytutor/data
Environment=PYTHONPATH=/opt/mytutor/engine:/opt/mytutor/app
Environment=DEEPTUTOR_SANDBOX_ALLOW_SUBPROCESS=1
Environment=PATH=/opt/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/mytutor/venv/bin/python -m uvicorn server.main:app --host 127.0.0.1 --port 8300
Restart=on-failure
MemoryHigh=600M
MemoryMax=1000M

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now mytutor
sleep 3
curl -fsS http://127.0.0.1:8300/api/health && echo
su -s /bin/bash mytutor -c 'bwrap --ro-bind / / /bin/true' && echo BWRAP_OK || echo BWRAP_FAIL_FALLBACK_SUBPROCESS
echo INSTALL_DONE