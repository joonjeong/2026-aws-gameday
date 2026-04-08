# solution/trial3 — Unicorn Rental Complex 모니터링

실제 AWS 환경 조사 결과를 기반으로 구성한 CloudWatch 대시보드 + 알람 CDK 스택.

## 파일 구조

```
solution/trial3/
├── architecture.md          # 아키텍처 분석 문서 (실제 환경 기반)
├── bin/trial3.ts            # CDK 앱 엔트리포인트
├── lib/monitoring-stack.ts  # 대시보드 + 알람 + SNS 스택
├── cdk.json
├── package.json
└── tsconfig.json
```

## 배포

```bash
cd solution/trial3
npm install
npx cdk synth   # 검증
npx cdk deploy  # 배포 (gameday-admin 프로파일 필요)
```

프로파일 지정:
```bash
npx cdk deploy --profile gameday-admin
```

## 생성 리소스

### SNS
- `unicorn-rental-complex-alarms` — 모든 알람의 알림 대상

### CloudWatch 알람

| 알람 이름 | 심각도 | 조건 | 이유 |
|-----------|--------|------|------|
| `unicorn-rental-CRITICAL-service-down` | CRITICAL | Composite (no-healthy OR 5xx) | 서비스 중단 통합 감지 |
| `unicorn-rental-CRITICAL-no-healthy-host` | CRITICAL | HealthyHostCount < 1 | 전체 서비스 중단 |
| `unicorn-rental-CRITICAL-unhealthy-host` | CRITICAL | UnhealthyHostCount > 0, 2회 | 인스턴스 장애 감지 |
| `unicorn-rental-CRITICAL-target-5xx` | CRITICAL | 5xx ≥ 10/분, 2회 | 앱 오류 급증 |
| `unicorn-rental-CRITICAL-response-time-p99` | CRITICAL | p99 > 3초, 3회 | 심각한 성능 저하 |
| `unicorn-rental-CRITICAL-rds-cpu-high` | CRITICAL | RDS CPU > 80%, 3회 | DB 병목 |
| `unicorn-rental-CRITICAL-rds-connections-high` | CRITICAL | 연결 수 > 80, 2회 | 연결 풀 고갈 임박 |
| `unicorn-rental-CRITICAL-rds-free-storage-low` | CRITICAL | 여유 스토리지 < 10GB | 디스크 고갈 위험 |
| `unicorn-rental-WARNING-ec2-cpu-high` | WARNING | EC2 CPU > 80%, 3회 | 스케일링 지연 |
| `unicorn-rental-WARNING-rds-free-memory-low` | WARNING | 여유 메모리 < 100MB | 메모리 압박 |
| `unicorn-rental-WARNING-dynamodb-read-throttle` | WARNING | ReadThrottle ≥ 1, 2회 | 세션 조회 실패 |
| `unicorn-rental-WARNING-dynamodb-write-throttle` | WARNING | WriteThrottle ≥ 1, 2회 | 세션 생성 실패 |
| `unicorn-rental-CRITICAL-dynamodb-system-error` | CRITICAL | SystemErrors ≥ 1 | AWS 측 장애 |

### CloudWatch 대시보드

`unicorn-rental-complex` 대시보드 (6행 구성):

1. **알람 상태** — 주요 알람 한눈에 확인
2. **ALB 가용성** — Healthy/Unhealthy Host, 5xx, 응답 시간 p99
3. **ALB 요청량** — 요청 수, 네트워크 In/Out
4. **EC2/ASG** — CPU 사용률, 스케일링 기준선
5. **RDS** — CPU, 연결 수, 여유 메모리, 여유 스토리지, 지연
6. **DynamoDB + Placeholder** — Throttle, 시스템 오류, Application Signals 예정 위치

## Slack 연동 (선행 작업 필요)

1. AWS Chatbot 콘솔에서 Slack workspace 승인
2. 아래 context 값 설정 후 재배포:

```bash
npx cdk deploy \
  -c enableSlackNotifications=true \
  -c slackWorkspaceId=<WORKSPACE_ID> \
  -c slackChannelId=<CHANNEL_ID> \
  --profile gameday-admin
```

현재는 SNS 토픽만 생성됨. Slack 연동은 작업 4에서 추가 예정.

## 알람 threshold 근거

- **Unhealthy Host**: 2개 인스턴스 환경에서 1개라도 Unhealthy면 50% 용량 손실
- **5xx ≥ 10/분**: 저트래픽 환경에서 절대값 기준 사용 (비율 계산 시 분모=0 오탐 방지)
- **p99 > 3초**: 정상 응답 기준 1초 이하, 3초 초과 시 사용자 경험 심각 저하
- **RDS 연결 > 80**: db.t3.micro max_connections ≈ 85, HikariCP 10 × 2인스턴스 = 20 정상
- **RDS 스토리지 < 10GB**: 100GB 할당의 10% 기준

## 현재 확인된 문제

- ⚠️ `i-0bed28b2b85599f40` (2b): Unhealthy 상태 → 즉시 조사 필요
- ⚠️ `i-0e34619c3bc752d74` (2a): Terminating 상태
- 배포 직후 `unicorn-rental-CRITICAL-unhealthy-host` 알람이 ALARM 상태일 가능성 높음
