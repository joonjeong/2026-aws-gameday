# Decision Log

작업 진행 중 내려진 의사결정을 타임라인 순으로 기록합니다.

---

## 2026-04-05T23:59 — Steering 문서 작성

- **결정**: Gameday 시작 전 steering.md 작성
- **이유**: 팀 방향성 정렬, 전략 수립, 역할 배정 기준 마련
- **산출물**: `steering.md`

---

## 2026-04-06T00:02 — 인프라 탐색 시작

- **결정**: AWS CLI로 현재 인프라 전체 파악 (EC2, ALB, ASG, VPC, SG, CFn 스택)
- **이유**: 퀘스트 수행 전 현황 파악 필수
- **발견 사항**:
  - `UnicornRentalApplicationStack` CREATE_IN_PROGRESS 상태 → 잠시 후 완료
  - VPC, 퍼블릭 서브넷 2개(2a/2b), ALB SG, App SG 확인
  - DynamoDB 테이블 `unicorn-rental-orders` 존재 확인

---

## 2026-04-06T00:05 — 인프라 탐색 재확인

- **결정**: 스택 완료 후 재조회
- **발견 사항**:
  - `UnicornRentalApplicationStack` CREATE_COMPLETE
  - ASG `unicorn-rental-asg` (min:2, max:4, desired:2) 정상 가동
  - EC2 2대 running: `i-01a1498147a8a1c61` (2b), `i-0f6f527fd55e8a62e` (2a)
  - Launch Template `unicorn-rental-lt` (t3.small, AL2023)
  - **ALB Listener 없음** → 트래픽 라우팅 불가 상태

---

## 2026-04-06T00:07 — 아키텍처 다이어그램 작성

- **결정**: 현재 인프라를 마크다운 다이어그램으로 문서화
- **이유**: 팀 공유 및 퀘스트 수행 시 참조 기준 확보
- **산출물**: `architecture.md`

---

## 2026-04-06T00:07 — CloudWatch 대시보드 CDK 구성 및 배포

- **결정**: CDK 기반으로 CloudWatch 대시보드 생성
- **이유**: 추후 수정 용이성, IaC로 관리, 워크로드 모니터링 즉시 확보
- **구성 지표**: ALB (RequestCount, p99 ResponseTime, 5xx, HealthyHost), ASG (InService), EC2 (CPU, Network), DynamoDB (RCU, WCU, SystemErrors)
- **산출물**: `cdk-dashboard/` 프로젝트, CloudFormation 스택 `UnicornRentalDashboardStack` 배포 완료
- **대시보드명**: `UnicornRental-Workload`

---

## 2026-04-06T00:14 — 퀘스트 목록 확인 및 우선순위 결정

- **결정**: Quest 1 → 2 → 4 → 3 순서로 진행
- **이유**: Quest 1(서비스 기동)이 블로커, 나머지는 의존성 없음
- **퀘스트 목록**:
  1. 기초 인프라 구축 및 서비스 기동
  2. 트래픽 폭주에 따른 확장성 대비
  3. 데이터 처리 및 실시간성 보장
  4. 장애 복구 및 운영 최적화

---

## 2026-04-06T00:15 — ALB Listener 생성 (Quest 1 완료)

- **결정**: HTTP:80 → TG:8080 Listener 생성
- **이유**: Listener 없어서 트래픽 라우팅 불가 상태였음
- **결과**: EC2 2대 모두 healthy 확인
- **산출물**: `k6/load-test.js` (smoke / load / spike 시나리오)

---

## 2026-04-06T00:16 — CDK 인프라 참조 스택 구성

- **결정**: 기존 리소스를 `cdk import` 대신 `fromLookup`/`fromArn`으로 참조하는 CDK 스택 생성
- **이유**: 기존 리소스가 `UnicornRentalApplicationStack`에서 이미 관리 중 → import 시 스택 충돌 발생
- **산출물**: `cdk-infra/` 프로젝트 (VPC, ALB, TG, ASG, DynamoDB, IAM Role 참조)

---

## 2026-04-06T00:20 — Quest 2: 확장성 대비 완료

- **결정**: 기존 CPU TargetTracking(60%) 보완 + 알람/알림 체계 구축
- **이유**: 트래픽 폭주 시 다각도 감지 및 자동 대응 필요
- **구현 내용**:
  - SNS Topic `unicorn-rental-alerts` 생성 (알림 허브)
  - CloudWatch Alarm 4종 추가:
    - `unicorn-rental-request-count-high`: RequestCountPerTarget > 1000/min (2회 연속)
    - `unicorn-rental-5xx-high`: 5xx 에러 > 50/min (2회 연속)
    - `unicorn-rental-cpu-critical`: CPU > 80% (긴급 알림)
    - `unicorn-rental-unhealthy-host`: Unhealthy 인스턴스 감지 즉시
  - ASG MaxSize 4 → 8 확장 (트래픽 폭주 대응 여유 확보)
- **기존 유지**: CPU TargetTracking 60% (기존 스택 관리)
- **산출물**: `UnicornRentalInfraStack` 배포 완료

---

## 2026-04-06T00:25 — ALB 트래픽 분배 개선

- **결정**: 알고리즘 `round_robin` → `weighted_random` + `anomaly_mitigation: on`
- **이유**: 스트레스 테스트 중 두 인스턴스 CPU 100% 포화 → ELB health check 실패 발생
  - round_robin은 처리 중인 요청 수를 고려하지 않아 포화 인스턴스에도 계속 트래픽 전달
  - anomaly_mitigation은 weighted_random에서만 지원
- **효과**: ALB가 비정상 응답 패턴 감지 시 해당 타겟 가중치 자동 감소
- **추가 조치**: ASG desired 2 → 4 즉시 확장 (health check 실패 대응)

---

## 2026-04-06T00:28 — Quest 3: 데이터 처리 및 실시간성 완료

- **결정**: DynamoDB Streams + Lambda 실시간 처리 파이프라인 구축
- **구현 내용**:
  - DynamoDB Streams 활성화 (`NEW_AND_OLD_IMAGES`)
  - TTL 활성화 (attribute: `ttl`) — 오래된 데이터 자동 정리
  - Lambda `unicorn-rental-stream-processor` 생성 (Node.js 22.x)
  - Event Source Mapping 연결 (BatchSize: 100, MaxRetry: 3, StartingPosition: LATEST)
- **스트림 ARN**: `arn:aws:dynamodb:ap-northeast-2:807876133169:table/unicorn-rental-orders/stream/2026-04-05T15:30:19.126`
- **TODO**: Lambda 내 실시간 처리 로직 구체화 (알림, 집계, 외부 연동)

---

## 2026-04-06T00:34 — 보안 강화 (즉시 적용 가능한 항목)

- **결정**: 보안 취약점 분석 후 즉시 적용 가능한 3가지 조치 실행
- **적용 내용**:
  1. SSH 22포트 인바운드 규칙 제거 (`sg-027c4cba2ffbd14e4`) → SSM Session Manager로 대체 (정책 이미 부착됨)
  2. ALB `drop_invalid_header_fields: true` → HTTP 헤더 인젝션 방어
  3. DynamoDB `DeletionProtectionEnabled: true` → 실수 삭제 방지
- **보류 항목**: HTTPS 전환, 프라이빗 서브넷 이동 → ECS 마이그레이션과 함께 진행 예정

---

## 2026-04-06T00:37 — Quest 4: 장애 복구 및 운영 최적화 완료

- **4. ALB 삭제 보호**: `deletion_protection.enabled: true`
- **3. DynamoDB PITR**: 35일 Point-in-Time Recovery 활성화
- **2. ASG Warmup**: 180s → 90s (`DefaultInstanceWarmup`)
- **1. Health Check 튜닝**:
  - interval: 30s → 10s
  - healthy/unhealthy threshold: 5/2 → 2/2
  - 장애 감지 시간: 최대 150s → 약 20s로 단축
- **보류**: CloudWatch Agent (ECS 전환 시 불필요), SNS 구독 (이메일 미확보)

---

## 2026-04-06T00:45 — ECS 마이그레이션 Phase 0: 컨테이너 이미지 준비

- **결정**: EC2 UserData 분석 → Java 앱 구조 파악 후 Dockerfile 작성
- **앱 구조 파악**:
  - Java 21 (Amazon Corretto), `jdk.httpserver` 모듈 사용
  - 단일 `.java` 파일 컴파일 후 실행
  - 환경변수: `PORT=8080`, `TABLE_NAME=unicorn-rental-orders`, `AWS_REGION`
- **Dockerfile**: multi-stage build (compile → runtime)
- **ECR**: `807876133169.dkr.ecr.ap-northeast-2.amazonaws.com/unicorn-rental:latest` 푸시 완료
- **기존 EC2 인프라 유지** (트래픽 전환 완료 전까지 제거 안 함)
- **다음 단계**: Private Subnet 추가 → ECS Cluster/Service 구성 → 가중치 기반 전환

---

## 2026-04-06T00:51 — 트래픽 테스트 (k6 스모크 테스트)

- **목적**: ALB 및 EC2 백엔드 서비스 안정성 검증
- **도구**: k6 v1.7.1
- **대상**: `unicorn-rental-alb-97259582.ap-northeast-2.elb.amazonaws.com`
- **설정**: VU 2, duration 30s
- **결과**:
  - 총 요청: 1,943건 / 실패율: 0% / 처리량: ~65 req/s
  - p(95) 응답시간: 52.51ms (threshold 2,000ms 대비 여유)
  - 평균 응답시간: 30.74ms / max: 59.77ms
- **산출물**: `smoke-test.js`

---

## 2026-04-06T01:03 — ALB 로그 기반 워크로드 분석

- **소스**: S3 버킷 `unicorn-rental-alb-logs-807876133169` ALB 액세스 로그
- **분석 대상**: 2026-04-04 18:27~18:28 로그 (1,133건)

### API 요청 분포

| 경로 | 건수 | 비율 |
|---|---|---|
| `GET /api/orders/create` | 525 | 46% |
| `GET /api/rentals/reserve` | 213 | 19% |
| `POST /api/orders` | 199 | 18% |
| `GET /api/orders/cancel` | 195 | 17% |

### 상태코드 분포 (04-04 로그)

| 코드 | 건수 | 의미 |
|---|---|---|
| 460 | 1,117 (98.6%) | 클라이언트 연결 끊김 (target 응답시간 -1) |
| 400 | 8 | Bad Request |
| 405 | 8 | Method Not Allowed |

> ⚠️ 460 에러 98%는 ECS 배포 중 상태였기 때문으로 판단. EC2 타겟 그룹은 정상.

### 외부 스캔 트래픽 (04-05 로그)

- WordPress 취약점 스캐닝 요청 101건 → 전부 503 응답 (ALB 정상 차단)

---

## 2026-04-06T01:07 — EC2 기반 CloudWatch 지표 분석

- **타겟 그룹**: `unicorn-rental-tg` (instance 타입, EC2 2대 모두 healthy)
- **분석 기간**: 2026-04-06 00:08~01:03 (1시간)

### 요청 트래픽 (5분 단위)

| 시간대 | 요청 수 | 비고 |
|---|---|---|
| 00:18~00:23 | 618 → 909 | 초기 스모크 테스트 |
| 00:53~00:58 | 7,225 → 10,604 | 5분 테스트 시도 (~35 req/s) |
| 그 외 | ~0~4 | 헬스체크 수준 |

### 응답시간

| 시간대 | 평균 응답시간 | 비고 |
|---|---|---|
| 00:18~00:23 | **7.7초 ~ 15.7초** | JVM 콜드 스타트 |
| 00:53~00:58 | **0.76ms ~ 0.86ms** | 워밍업 이후 정상 |

### 에러율

- 4xx / 5xx: **0건** — 완전 정상

### 결론

- EC2 서비스 자체는 안정적 (에러 없음, healthy 유지)
- 콜드 스타트 시 최대 15초 응답 지연 발생 → ALB slow start 또는 워밍업 스크립트 권장
- 워밍업 이후 응답시간 1ms 미만으로 매우 빠름

---

## 2026-04-06T01:16 — ECS 헬스체크 실패 원인 분석 및 수정

- **원인**: Dockerfile에 `aws` CLI 미포함 → 컨테이너 내 `aws dynamodb describe-table` 실행 실패 → `/actuator/health` 503 반환 → ECS TG unhealthy
- **수정**: Dockerfile에 `RUN yum install -y awscli && yum clean all` 추가
- **추가 발견**: ECS TG Matcher가 `200`만 허용 (EC2 TG는 `200-399`) → 503 응답 시 불일치
- **조치**:
  - Dockerfile 수정 후 ECR 재푸시 (`latest`)
  - ECS 서비스 `--force-new-deployment` 실행
- **다음 단계**: ECS 태스크 healthy 확인 → 가중치 순차 전환 (EC2 100→50→0, ECS 0→50→100)

---

## 2026-04-06T01:13 — 세션 재개 후 현황 점검

- **CloudFormation 스택 상태**:
  - `UnicornRentalEcsStack`: **CREATE_IN_PROGRESS** (ECS Service 생성 중 — 이전 세션에서 시작됨)
  - 나머지 스택 모두 COMPLETE
- **ECS 서비스**: ACTIVE, Running 2 / Desired 2 (태스크 2개 실행 중)
- **ECS TG 헬스**: 2개 unhealthy (`Target.ResponseCodeMismatch`), 3개 draining
  - `/actuator/health` 경로가 200-399 외 응답 반환 중 → 헬스체크 경로 문제 가능성
- **EC2 TG 헬스**: 2개 모두 healthy
- **ALB Listener Rule**: EC2 TG 100% / ECS TG 0% (가중치 전환 전 상태 유지 중)
- **다음 단계**: ECS 태스크 헬스체크 실패 원인 파악 → 수정 후 가중치 전환

---

## 2026-04-06T00:50 — ECS 마이그레이션 Phase 1: Private Subnet + NAT Gateway

- **결정**: 기존 NetworkStack 수정 없이 별도 `UnicornRentalEcsNetworkStack`으로 추가
- **이유**: 기존 스택 변경 시 EC2 인프라에 영향 가능성 → 안전하게 분리
- **생성 리소스**:
  - Private Subnet 1: `subnet-04a59955a270de443` (10.0.2.0/24, ap-northeast-2a)
  - Private Subnet 2: `subnet-0a935a75140b0445a` (10.0.3.0/24, ap-northeast-2b)
  - NAT Gateway: `nat-0f2108843c214494a` (Public Subnet 2a에 배치)
  - Private Route Table 2개 (0.0.0.0/0 → NAT GW)
- **다음 단계**: ECS Cluster + Task Definition + Service + 신규 Target Group 구성

---
