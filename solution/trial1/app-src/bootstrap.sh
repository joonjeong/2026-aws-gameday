#!/bin/bash
set -euo pipefail

exec > >(tee /var/log/unicorn-rental-bootstrap.log) 2>&1
trap 'status=$?; echo "bootstrap failed for unicorn-rental with exit ${status}"; journalctl -u unicorn-rental.service --no-pager -n 100 || true; exit ${status}' ERR

dnf install -y awscli java-21-amazon-corretto-devel

install -d -o ec2-user -g ec2-user /opt/unicorn-rental/app

for required_file in \
  "/opt/unicorn-rental/app/UnicornRentalApp.java" \
  "/etc/unicorn-rental.env" \
  "/etc/systemd/system/unicorn-rental.service"
do
  test -s "${required_file}"
done

command -v aws
aws --version
chmod 600 /etc/unicorn-rental.env
chmod 644 /etc/systemd/system/unicorn-rental.service
chown ec2-user:ec2-user /opt/unicorn-rental/app/UnicornRentalApp.java

javac --add-modules jdk.httpserver -d /opt/unicorn-rental/app /opt/unicorn-rental/app/UnicornRentalApp.java
chown -R ec2-user:ec2-user /opt/unicorn-rental/app

systemctl daemon-reload
systemctl enable --now unicorn-rental.service

for attempt in $(seq 1 15); do
  if systemctl is-active --quiet unicorn-rental.service; then
    echo "unicorn-rental.service is active"
    exit 0
  fi
  sleep 1
done

echo "unicorn-rental.service did not become active"
journalctl -u unicorn-rental.service --no-pager -n 100 || true
exit 1
