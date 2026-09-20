#!/usr/bin/env bash
set -euo pipefail
app_id="${1:?Expected the preview package}"
adb=/opt/android-sdk/platform-tools/adb
deadline=$((SECONDS + 170))
until "$adb" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' | grep -qx 1; do
  (( SECONDS < deadline )) || { echo 'Android boot timed out' >&2; exit 1; }
  sleep 1
done
"$adb" shell settings put system screen_off_timeout 2147483647
"$adb" shell input keyevent KEYCODE_WAKEUP
"$adb" shell wm dismiss-keyguard
"$adb" shell monkey -p "$app_id" -c android.intent.category.LAUNCHER 1
sleep 3
"$adb" shell pidof "$app_id"
