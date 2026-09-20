#!/usr/bin/env bash
set -euo pipefail

# The caller provides only this tunnel's connector token, never account keys.
test -s /etc/proof-preview/tunnel-token
curl --fail --location --silent --show-error https://github.com/cloudflare/cloudflared/releases/download/2026.9.1/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod 755 /usr/local/bin/cloudflared
/usr/local/bin/cloudflared --version
cat > /etc/systemd/system/proof-tunnel.service <<'UNIT'
[Unit]
Description=Protected Android preview tunnel
After=network-online.target proof-websockify.service proof-firewall.service
Requires=proof-websockify.service proof-firewall.service
[Service]
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate run --token-file /etc/proof-preview/tunnel-token
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now proof-tunnel
sleep 5
systemctl is-active proof-tunnel
