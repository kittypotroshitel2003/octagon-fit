#!/bin/sh
set -eu
DIR="/home/deploy/octagon-lead-api"
PIDFILE="$DIR/service.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then exit 0; fi
cd "$DIR"
nohup /usr/bin/python3 -I "$DIR/mail-api.py" >> "$DIR/service.log" 2>&1 < /dev/null &
echo $! > "$PIDFILE"
