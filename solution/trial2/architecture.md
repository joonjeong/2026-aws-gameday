# Unicorn Rental — Architecture Diagram

> 계정: 807876133169 | 리전: ap-northeast-2 | 최종 업데이트: 2026-04-06T00:27

---

## 전체 구성도

```
Internet
    │
    ▼
┌──────────────────────────────────────────────────────────────────┐
│  ALB (unicorn-rental-alb)                                        │
│  unicorn-rental-alb-97259582.ap-northeast-2.elb.amazonaws.com   │
│  SG: unicorn-rental-alb-sg (inbound: 80/tcp 0.0.0.0/0)          │
│  Listener: HTTP:80 → unicorn-rental-tg                           │
│                                                                  │
│  Target Group: unicorn-rental-tg (:8080)                         │
│  Algorithm: weighted_random + anomaly_mitigation: ON             │
│  Health Check: /actuator/health (HTTP 200-399)                   │
└──────┬───────────────────────────────────────────────────────────┘
       │ 트래픽 분배 (weighted_random, anomaly mitigation)
       ├──────────────────┬──────────────────┬──────────────────┐
       ▼                  ▼                  ▼                  ▼
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
│ t3.small   │  │ t3.small   │  │ t3.small   │  │ t3.small   │
│i-01a1498.. │  │i-06ccce6.. │  │i-0de9fc6.. │  │i-0eb58ec.. │
│ 2b ⚠️Unhealthy│ │ 2a ✅Healthy│  │ 2b ✅Healthy│  │ 2a ✅Healthy│
│ Java :8080 │  │ Java :8080 │  │ Java :8080 │  │ Java :8080 │
└────────────┘  └────────────┘  └────────────┘  └────────────┘
       │
       └── ASG: unicorn-rental-asg
           Launch Template: unicorn-rental-lt (AL2023, t3.small)
           Min: 2 / Desired: 4 / Max: 8
           Scaling: CPU TargetTracking 60% (warmup 180s)
           SG: unicorn-rental-app-sg (8080 from ALB, 22 from 0.0.0.0/0)
```

> ※ `i-0f6f527fd55e8a62e` (2a): ELB health check 실패로 Terminating 중

---

## VPC 구성

```
VPC: unicorn-rental-vpc (10.0.0.0/16)
│
├── Public Subnet 1: subnet-0a17534532f685133 (10.0.0.0/24, 2a) — ALB, EC2
├── Public Subnet 2: subnet-06ab851233d51d199 (10.0.1.0/24, 2b) — ALB, EC2
├── Private Subnet 1: subnet-04a59955a270de443 (10.0.2.0/24, 2a) — ECS ← NEW
├── Private Subnet 2: subnet-0a935a75140b0445a (10.0.3.0/24, 2b) — ECS ← NEW
└── NAT Gateway: nat-0f2108843c214494a (Public Subnet 1에 배치) ← NEW
```

---

## 데이터 계층

```
EC2 (Java App)
    │
    ▼ AWS SDK (IAM Role: unicorn-rental-ec2-role)
DynamoDB Table: unicorn-rental-orders
  PK: pk (S), SK: sk (S)
  Billing: PAY_PER_REQUEST (On-demand)
```

---

## 모니터링 / 알람

```
CloudWatch Dashboard: UnicornRental-Workload
    ├── ALB: RequestCount, ResponseTime p99, 5xx, HealthyHostCount
    ├── ASG: InServiceInstances
    ├── EC2 (인스턴스별): CPU, NetworkIn/Out
    └── DynamoDB: RCU, WCU, SystemErrors

CloudWatch Alarms → SNS: unicorn-rental-alerts
    ├── unicorn-rental-request-count-high  (RequestCountPerTarget > 1000/min × 2)
    ├── unicorn-rental-5xx-high            (5xx > 50/min × 2)
    ├── unicorn-rental-cpu-critical        (CPU > 80% × 2)
    └── unicorn-rental-unhealthy-host      (UnhealthyHostCount > 0 × 1)
```

---

## CloudFormation 스택 구성

| 스택 | 설명 | 상태 |
|---|---|---|
| `UnicornRentalNetworkStack` | VPC, Subnet | UPDATE_COMPLETE |
| `UnicornRentalApplicationStack` | ALB, ASG, EC2, DynamoDB | CREATE_COMPLETE |
| `UnicornRentalInfraStack` | Alarms, SNS (CDK 관리) | CREATE_COMPLETE |
| `UnicornRentalDashboardStack` | CloudWatch Dashboard (CDK 관리) | CREATE_COMPLETE |

---

## 데이터 처리 (Quest 3)

```
DynamoDB unicorn-rental-orders
    │ Streams (NEW_AND_OLD_IMAGES)
    ▼
Lambda: unicorn-rental-stream-processor (Node.js 22.x)
    - BatchSize: 100, MaxRetry: 3, StartingPosition: LATEST
    - 실시간 변경 이벤트 처리 (TODO: 비즈니스 로직 구체화)

TTL: ttl 속성 기반 자동 만료
```

---

## 변경 이력

| 시각 | 변경 내용 |
|---|---|
| 00:15 | ALB Listener HTTP:80 생성 (Quest 1) |
| 00:21 | CloudWatch Alarm 4종 + SNS Topic 생성 (Quest 2) |
| 00:21 | ASG MaxSize 4 → 8 확장 |
| 00:24 | 스트레스 테스트 중 CPU 100% 포화 → ASG desired 2 → 4 긴급 확장 |
| 00:25 | ALB 알고리즘 round_robin → weighted_random + anomaly_mitigation ON |
| 00:30 | DynamoDB Streams 활성화 + TTL 설정 + Lambda 스트림 프로세서 연결 (Quest 3) |
| 00:34 | SSH 22포트 제거, ALB 헤더 보호, DynamoDB 삭제 보호 활성화 (보안 강화) |
| 00:37 | DynamoDB PITR 활성화 (35일), ALB 삭제 보호 활성화 (Quest 4) |
| 00:37 | Health Check interval 30s→10s, threshold 5→2 (장애 감지 단축) |
| 00:37 | ASG DefaultInstanceWarmup 180s→90s |
| 00:45 | Dockerfile 작성 + ECR 푸시 (ECS 마이그레이션 Phase 0) |
| 00:50 | Private Subnet 2개 + NAT Gateway 추가 (ECS 마이그레이션 Phase 1) |
| 00:52 | ECS Cluster + Task Definition + Service + ECS TG 생성 (ECS 마이그레이션 Phase 2) |
| 01:16 | Dockerfile에 AWS CLI 추가 → ECR 재푸시 → ECS 강제 재배포 (헬스체크 503 수정) |

---

## 현재 알려진 이슈 / 개선 포인트

| 항목 | 현황 | 비고 |
|---|---|---|
| 프라이빗 서브넷 | ❌ 없음 | ECS 마이그레이션 시 함께 진행 예정 |
| HTTPS | ❌ HTTP만 지원 | ECS 마이그레이션 시 함께 진행 예정 |
| SSH 접근 | ✅ 제거됨 | SSM Session Manager로 대체 |
| ALB 헤더 보호 | ✅ 활성화 | drop_invalid_header_fields: true |
| DynamoDB 삭제 보호 | ✅ 활성화 | DeletionProtectionEnabled: true |
| DynamoDB PITR | ✅ 활성화 (35일) | Point-in-Time Recovery |
| ALB 삭제 보호 | ✅ 활성화 | deletion_protection: true |
| Health Check | interval 10s, threshold 2 | 장애 감지 ~20초로 단축 |
| ASG Warmup | 90초 | 기존 180초에서 단축 |
| t3.small 스펙 | 트래픽 폭주 시 CPU 100% | 인스턴스 타입 업그레이드 또는 ECS 전환 검토 |
| Lambda 처리 로직 | TODO | 실시간 비즈니스 로직 구체화 필요 |
| ECS 헬스체크 | ✅ 수정됨 | Dockerfile에 AWS CLI 추가, 재배포 중 |
| ECS 트래픽 전환 | ⏳ 대기 중 | ECS healthy 확인 후 순차 전환 예정 (100→50→0) |
