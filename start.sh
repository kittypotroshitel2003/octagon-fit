#!/bin/bash
cd "$(dirname "$0")"
PORT=8080

# Убить процесс на порту, если уже запущен
lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null

# Запустить сервер в фоне
python3 -m http.server $PORT &
SERVER_PID=$!

sleep 0.4
open "http://localhost:$PORT"

echo "Сервер запущен: http://localhost:$PORT"
echo "Для остановки: kill $SERVER_PID"
wait $SERVER_PID
