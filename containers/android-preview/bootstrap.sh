#!/usr/bin/env bash
set -euo pipefail

# Run through SSM on the disposable probe. The launch template installs an
# independent 30-minute shutdown timer before this script begins.
for package in tigervnc-server python3-pip java-17-amazon-corretto-headless unzip; do
  dnf install -y "$package" >/dev/null
done
dnf install -y libX11 libX11-xcb libxcb libXcomposite libXcursor libXdamage libXext libXfixes libXi libXrender libXtst libXrandr mesa-libGL libglvnd pulseaudio-libs >/dev/null
python3 -m venv /opt/proof-bridge
/opt/proof-bridge/bin/pip install --disable-pip-version-check 'websockify==0.13.0' >/dev/null
curl --fail --location --silent --show-error https://github.com/novnc/noVNC/archive/refs/tags/v1.7.0.tar.gz | tar xz -C /opt
ln -sfn /opt/noVNC-1.7.0 /opt/novnc
install -d /opt/android-sdk/cmdline-tools
curl --fail --location --silent --show-error -o /tmp/android-cli.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q -o /tmp/android-cli.zip -d /tmp/android-cli
cp -a /tmp/android-cli/cmdline-tools /opt/android-sdk/cmdline-tools/latest
export ANDROID_HOME=/opt/android-sdk
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
set +o pipefail
yes | sdkmanager --licenses >/dev/null
set -o pipefail
sdkmanager 'platform-tools' 'emulator' 'system-images;android-34;google_apis;x86_64' >/dev/null
emulator -version 2>&1 | head -n 2
emulator -accel-check
id android >/dev/null 2>&1 || useradd --create-home --shell /usr/sbin/nologin android
usermod -aG kvm android
chmod -R a+rX /opt/android-sdk
install -d -o android -g android '/home/android/.config/Android Open Source Project'
cat > '/home/android/.config/Android Open Source Project/Emulator.conf' <<'CONFIG'
[General]
showNestedWarning=false
[set]
clipboardSharing=false
CONFIG
chown android:android '/home/android/.config/Android Open Source Project/Emulator.conf'
runuser -u android -- env ANDROID_HOME="$ANDROID_HOME" PATH="$PATH" bash -c 'echo no | avdmanager create avd -n preview -k "system-images;android-34;google_apis;x86_64" -d pixel_5 --force'
cat >> /home/android/.android/avd/preview.avd/config.ini <<'AVD'
hw.lcd.width=720
hw.lcd.height=1280
hw.lcd.density=320
hw.keyboard=yes
AVD
cat > /etc/systemd/system/proof-display.service <<'UNIT'
[Unit]
Description=Isolated Android virtual display
[Service]
User=android
Group=android
ExecStart=/usr/bin/Xvnc :1 -geometry 800x1440 -depth 24 -localhost -rfbport 5901 -SecurityTypes None -AcceptCutText=0 -SendCutText=0 -AlwaysShared=0 -NeverShared=1 -DisconnectClients=0 -FrameRate=30
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/home/android /tmp
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/proof-emulator.service <<'UNIT'
[Unit]
Description=Android preview emulator
After=proof-display.service
Requires=proof-display.service
[Service]
User=android
Group=android
Environment=ANDROID_HOME=/opt/android-sdk
Environment=DISPLAY=:1
Environment=QT_X11_NO_MITSHM=1
ExecStart=/opt/android-sdk/emulator/emulator -avd preview -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot -no-metrics -no-skin
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/home/android /tmp
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/proof-websockify.service <<'UNIT'
[Unit]
Description=Loopback-only Android browser bridge
After=proof-display.service
Requires=proof-display.service
[Service]
User=android
ExecStart=/opt/proof-bridge/bin/websockify --web /opt/novnc 127.0.0.1:8080 127.0.0.1:5901
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now proof-display proof-emulator proof-websockify
deadline=$((SECONDS + 180))
until runuser -u android -- /opt/android-sdk/platform-tools/adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' | grep -qx 1; do
  if (( SECONDS >= deadline )); then journalctl -u proof-emulator -n 25 --no-pager; exit 1; fi
  sleep 2
done
curl --fail --silent -o /dev/null -w 'bridge_http=%{http_code}\n' http://127.0.0.1:8080/vnc.html
rpm -q tigervnc-server
/opt/proof-bridge/bin/python -c 'from importlib.metadata import version; print("websockify " + version("websockify"))'
echo PRIVATE_BRIDGE_READY
