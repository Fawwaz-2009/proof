#!/usr/bin/env bash
set -euo pipefail

# The guest's NAT sockets belong to the emulator's Unix user. IMDSv2 alone
# does not protect instance credentials from that user. Deny both metadata
# endpoints even when the Android app creates arbitrary outbound connections.
dnf install -y iptables-nft >/dev/null
cat > /usr/local/sbin/proof-preview-firewall <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
iptables -C OUTPUT -d 169.254.0.0/16 -m owner --uid-owner android -j REJECT 2>/dev/null || iptables -I OUTPUT -d 169.254.0.0/16 -m owner --uid-owner android -j REJECT
ip6tables -C OUTPUT -d fd00:ec2::254/128 -m owner --uid-owner android -j REJECT 2>/dev/null || ip6tables -I OUTPUT -d fd00:ec2::254/128 -m owner --uid-owner android -j REJECT
SCRIPT
chmod 755 /usr/local/sbin/proof-preview-firewall
cat > /etc/systemd/system/proof-firewall.service <<'UNIT'
[Unit]
Description=Keep guest processes away from instance credentials
Before=proof-emulator.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/proof-preview-firewall
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
UNIT
install -d /etc/systemd/system/proof-emulator.service.d
cat > /etc/systemd/system/proof-emulator.service.d/firewall.conf <<'UNIT'
[Unit]
Requires=proof-firewall.service
After=proof-firewall.service
UNIT
systemctl daemon-reload
systemctl enable --now proof-firewall
if runuser -u android -- curl --max-time 3 --silent --fail -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token >/dev/null; then
  echo 'FAIL: emulator user can access instance metadata' >&2
  exit 1
fi
echo 'PASS: emulator user cannot access instance metadata'
