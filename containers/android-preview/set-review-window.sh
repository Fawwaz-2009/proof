#!/usr/bin/env bash
set -euo pipefail

# Explicit bounded handoff after public transport verification. This is an
# absolute review window, not the future pool's activity-based lease.
review_hours="${ANDROID_PREVIEW_REVIEW_HOURS:-6}"
deadline=$(python3 - "$review_hours" <<'PY'
import datetime, math, sys
hours = float(sys.argv[1])
if not math.isfinite(hours) or not 0 < hours <= 24:
    raise SystemExit("Review window must be more than zero and at most 24 hours")
print((datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S UTC"))
PY
)
deadline_epoch=$(date -u -d "$deadline" +%s)
cat > /etc/systemd/system/proof-review-guard.service <<UNIT
[Unit]
Description=Stop a preview restarted after its review deadline
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 -c "import time, subprocess; time.time() < $deadline_epoch or subprocess.run(['/usr/sbin/shutdown', '-h', 'now'], check=True)"
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/proof-review-expiry.timer <<UNIT
[Unit]
Description=Stop the Android review host at its absolute deadline
[Timer]
OnCalendar=$deadline
Persistent=true
Unit=proof-probe-expiry.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now proof-review-guard.service
systemctl enable --now proof-review-expiry.timer
systemctl is-active --quiet proof-review-expiry.timer
# Only replace the 30-minute experiment timer after its successor is armed.
systemctl disable --now proof-probe-expiry.timer
python3 - "$deadline" "$review_hours" > /opt/novnc/review-window.json <<'PY'
import datetime, json, sys
deadline = datetime.datetime.strptime(sys.argv[1], "%Y-%m-%d %H:%M:%S UTC").replace(tzinfo=datetime.timezone.utc)
print(json.dumps({"expiresAt": deadline.isoformat(), "hours": float(sys.argv[2])}))
PY
chmod 644 /opt/novnc/review-window.json
systemctl list-timers proof-review-expiry.timer --no-pager
