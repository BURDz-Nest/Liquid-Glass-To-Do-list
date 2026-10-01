#!/bin/zsh
# Double-click this file in Finder to open the locally stored checklist.
set -e
cd "$(dirname "$0")"
if ! curl --silent --fail http://127.0.0.1:8766/api/checklist >/dev/null 2>&1; then
  .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8766 >/tmp/project-checklist.log 2>&1 &
  sleep 1
fi
open "http://127.0.0.1:8766"
