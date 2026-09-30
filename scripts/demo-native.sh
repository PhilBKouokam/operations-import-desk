#!/usr/bin/env bash
set -euo pipefail
export ODI_LOCAL_DEMO=1
exec bash scripts/test-browser-services.sh
