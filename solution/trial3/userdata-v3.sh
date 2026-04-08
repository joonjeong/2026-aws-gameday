#!/bin/bash
set -euo pipefail
install -d -o ec2-user -g ec2-user '/opt/unicorn-rental-complex/app'
mkdir -p $(dirname '/opt/unicorn-rental-complex/app/unicorn-rental-complex-app.jar')
aws s3 cp 's3://unicorn-rental-complex-artifacts/artifacts/unicorn-rental-complex-app.jar' '/opt/unicorn-rental-complex/app/unicorn-rental-complex-app.jar' --region ap-northeast-2
mkdir -p "$(dirname '/etc/unicorn-rental-complex.env')"
cat <<'EOF' > '/etc/unicorn-rental-complex.env'
PORT=8080
AWS_REGION=ap-northeast-2
AWS_DEFAULT_REGION=ap-northeast-2
SPRING_DATASOURCE_URL=jdbc:postgresql://unicornrentalcomplexappli-postgresdatabase0a8a7373-pao9fozmhtg5.cvcmwys22jux.ap-northeast-2.rds.amazonaws.com:5432/unicorn_rental
SPRING_DATASOURCE_USERNAME=unicorn_app
SESSION_TABLE_NAME=unicorn-rental-complex-sessions
SESSION_TTL_HOURS=8

EOF
chmod 600 '/etc/unicorn-rental-complex.env'
mkdir -p "$(dirname '/etc/systemd/system/unicorn-rental-complex.service')"
cat <<'EOF' > '/etc/systemd/system/unicorn-rental-complex.service'
[Unit]
Description=Unicorn Rental Complex Spring Boot service
After=network.target

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=/opt/unicorn-rental-complex/app
EnvironmentFile=/etc/unicorn-rental-complex.env
ExecStart=/usr/bin/java -XX:+ExitOnOutOfMemoryError -javaagent:/opt/aws/adot/lib/aws-opentelemetry-agent.jar -jar /opt/unicorn-rental-complex/app/unicorn-rental-complex-app.jar
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target

EOF
chmod 644 '/etc/systemd/system/unicorn-rental-complex.service'
mkdir -p "$(dirname '/tmp/unicorn-rental-bootstrap.sh')"
cat <<'EOF' > '/tmp/unicorn-rental-bootstrap.sh'
#!/bin/bash
set -euo pipefail

exec > >(tee /var/log/unicorn-rental-complex-bootstrap.log) 2>&1
trap 'status=$?; echo "bootstrap failed for unicorn-rental-complex with exit ${status}"; journalctl -u unicorn-rental-complex.service --no-pager -n 100 || true; exit ${status}' ERR

dnf install -y awscli jq java-17-amazon-corretto-headless

# ── CloudWatch Agent 설치 ──────────────────────────────────────────────────
dnf install -y amazon-cloudwatch-agent

cat <<'CWCFG' > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
{
  "agent": { "region": "ap-northeast-2" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/unicorn-rental-complex-bootstrap.log",
            "log_group_name": "/unicorn-rental-complex/bootstrap",
            "log_stream_name": "{instance_id}"
          }
        ]
      },
      "journald": {
        "collect_list": [
          {
            "log_group_name": "/unicorn-rental-complex/app",
            "log_stream_name": "{instance_id}",
            "units": ["unicorn-rental-complex.service"]
          }
        ]
      }
    }
  }
}
CWCFG

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s

# ── ADOT Java Agent 설치 (Application Signals) ────────────────────────────
ADOT_VERSION="v1.32.6"
mkdir -p /opt/aws/adot/lib
curl -fsSL \
  "https://github.com/aws-observability/aws-otel-java-instrumentation/releases/download/${ADOT_VERSION}/aws-opentelemetry-agent.jar" \
  -o /opt/aws/adot/lib/aws-opentelemetry-agent.jar

# ── 앱 환경변수에 OTEL 설정 추가 ──────────────────────────────────────────
cat <<'OTELENV' >> /etc/unicorn-rental-complex.env
OTEL_METRICS_EXPORTER=none
OTEL_LOGS_EXPORTER=none
OTEL_AWS_APPLICATION_SIGNALS_ENABLED=true
OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT=http://localhost:4316/v1/metrics
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4316/v1/traces
OTEL_PROPAGATORS=xray,tracecontext,baggage,b3
OTEL_RESOURCE_ATTRIBUTES=service.name=unicorn-rental-complex,deployment.environment=production
OTELENV

install -d -o ec2-user -g ec2-user /opt/unicorn-rental-complex/app

for required_file in \
  "/opt/unicorn-rental-complex/app/unicorn-rental-complex-app.jar" \
  "/etc/unicorn-rental-complex.env" \
  "/etc/systemd/system/unicorn-rental-complex.service"
do
  test -s "${required_file}"
done

command -v aws
aws --version
db_secret_json="$(aws secretsmanager get-secret-value --secret-id 'arn:aws:secretsmanager:ap-northeast-2:075647413732:secret:UnicornRentalComplexApplica-F7oYnDYqYFgn-CBjdob' --query SecretString --output text)"
db_password="$(printf '%s' "${db_secret_json}" | jq -r '.password')"
if [[ -z "${db_password}" || "${db_password}" == "null" ]]; then
  echo "database password lookup failed"
  exit 1
fi

printf '\nSPRING_DATASOURCE_PASSWORD=%s\n' "${db_password}" >> "/etc/unicorn-rental-complex.env"
chmod 600 /etc/unicorn-rental-complex.env
chmod 644 /etc/systemd/system/unicorn-rental-complex.service
chown -R ec2-user:ec2-user /opt/unicorn-rental-complex/app
chown ec2-user:ec2-user /opt/unicorn-rental-complex/app/unicorn-rental-complex-app.jar

systemctl daemon-reload
systemctl enable --now unicorn-rental-complex.service

for attempt in $(seq 1 15); do
  if systemctl is-active --quiet unicorn-rental-complex.service; then
    echo "unicorn-rental-complex.service is active"
    exit 0
  fi
  sleep 1
done

echo "unicorn-rental-complex.service did not become active"
journalctl -u unicorn-rental-complex.service --no-pager -n 100 || true
exit 1

EOF
chmod 755 '/tmp/unicorn-rental-bootstrap.sh'
set -e
chmod +x '/tmp/unicorn-rental-bootstrap.sh'
'/tmp/unicorn-rental-bootstrap.sh'
