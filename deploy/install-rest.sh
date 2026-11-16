#!/bin/bash
# 顺序安装其余三个语言包（一次一个，避免 1.6G 内存机器并发压力）
for p in javascript html-css typescript; do
  cd /opt/mytutor/app
  runuser -u mytutor -- env MYTUTOR_DATA=/opt/mytutor/data PYTHONPATH=/opt/mytutor/engine:/opt/mytutor/app PATH=/opt/node24/bin:/usr/bin:/bin /opt/mytutor/venv/bin/python /opt/mytutor-src/server_check.py install "$p"
done
echo ALL_DONE