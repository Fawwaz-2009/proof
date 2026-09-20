#!/usr/bin/env bash
set -euo pipefail

# Run from this recipe's extracted directory, after bootstrap and harden.
# The package is build identity, supplied by the operator, never a template id.
: "${ANDROID_APP_ID:?Set ANDROID_APP_ID to the installed preview package}"
[[ "$ANDROID_APP_ID" =~ ^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$ ]] || exit 1
install -d /opt/proof-preview
install -m 644 reviewer.html /opt/novnc/index.html
install -m 644 position-window.py /opt/proof-preview/position-window.py
install -m 644 launch-app.sh /opt/proof-preview/launch-app.sh
install -d /etc/systemd/system/proof-emulator.service.d
cat > /etc/systemd/system/proof-emulator.service.d/position.conf <<'UNIT'
[Service]
ExecStartPre=/usr/bin/python3 /opt/proof-preview/position-window.py --wait-display
ExecStartPost=/usr/bin/python3 /opt/proof-preview/position-window.py
UNIT
cat > /etc/systemd/system/proof-launch.service <<UNIT
[Unit]
Description=Open the native preview after Android boots
After=proof-emulator.service
Requires=proof-emulator.service
[Service]
User=android
Type=oneshot
ExecStart=/usr/bin/bash /opt/proof-preview/launch-app.sh $ANDROID_APP_ID
TimeoutStartSec=180
RemainAfterExit=yes
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/home/android /tmp
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
runuser -u android -- python3 /opt/proof-preview/position-window.py
systemctl enable proof-launch
systemctl restart proof-launch
echo REVIEWER_INSTALLED
