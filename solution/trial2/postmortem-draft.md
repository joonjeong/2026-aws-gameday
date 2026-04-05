# Postmortem Draft — Unicorn Rental Gameday
> 작성일: 2026-04-06 | 작성자: TBD

---

## 개요

AWS Gameday (Unicorn Rental 시나리오) 진행 중 발생한 이슈 및 개선 포인트를 정리한다.
실제 포스트모텀 작성 시 이 초안을 기반으로 보완한다.

---

## 타임라인 요약

| 시각 | 이벤트 |
|---|---|
| 23:59 | Gameday 시작, steering.md 작성 |
| 00:02 | 인프라 탐색 시작 |
| 00:05 | ALB Listener 없음 발견 (서비스 불통 상태) |
| 00:15 | ALB Listener 생성 → 서비스 복구 (Quest 1) |
| 00:24 | 스트레스 테스트 중 CPU 100% 포화 → ASG 긴급 확장 |
| 00:25 | ALB 알고리즘 round_robin → weighted_random 전환 |
| 00:45 | ECS 마이그레이션 시작 (Dockerfile 작성) |
| 00:50 | Private Subnet + NAT Gateway 추가 |
| 00:52 | ECS Cluster/Service 배포 — 헬스체크 실패 발생 |
| 01:13 | 세션 재개 후 현황 점검 — ECS TG 2개 unhealthy 확인 |
| 01:16 | 원인 파악 (AWS CLI 미포함) → Dockerfile 수정 → 재배포 |
| 01:45 | ECS 마이그레이션 완료 — 가중치 순차 전환 후 ECS 100% |
| 01:54 | k6 Load 테스트 실행 — ~65 req/s 안정 처리 확인 |
| 01:55 | 운영 점검 — Container Insights 활성화, DynamoDB PITR 재확인 |

---

## 이슈 목록

### 🔴 Issue 1: ALB Listener 누락으로 서비스 불통

- **발생**: Gameday 시작 시점부터 (사전 구성 문제)
- **감지**: 인프라 탐색 중 발견 (00:05)
- **영향**: 서비스 전체 불통 — 외부 트래픽 0%
- **복구**: ALB HTTP:80 Listener 수동 생성 (00:15)
- **소요 시간**: ~10분
- **더 일찍 했어야 했던 것**:
  - 인프라 탐색 시 ALB Listener 유무를 **첫 번째 체크 항목**으로 두었어야 함
  - `aws elbv2 describe-listeners` 를 탐색 스크립트에 포함했어야 함

---

### 🟡 Issue 2: 스트레스 테스트 중 CPU 100% 포화

- **발생**: 00:24 (k6 부하 테스트 중)
- **감지**: CloudWatch 알람 + ELB health check 실패
- **영향**: 일부 인스턴스 unhealthy, 응답 지연
- **복구**: ASG desired 2→4 긴급 확장 + ALB 알고리즘 변경
- **더 일찍 했어야 했던 것**:
  - **스트레스 테스트 전** ASG MaxSize/Desired를 미리 확장했어야 함
  - ALB weighted_random + anomaly_mitigation을 Quest 2 완료 시점에 바로 적용했어야 함 (실제로는 포화 후 적용)

---

### 🔴 Issue 3: ECS 컨테이너 헬스체크 지속 실패 (503)

- **발생**: 00:52 ECS 서비스 배포 직후
- **감지**: ECS TG `Target.ResponseCodeMismatch` (01:13 세션 재개 후 확인)
- **영향**: ECS 태스크 전체 unhealthy → 트래픽 전환 불가
- **근본 원인 (1차)**: Dockerfile에 `aws` CLI 미포함 → `/actuator/health` 내부에서 `aws dynamodb describe-table` subprocess 실행 실패 → 503 반환
- **근본 원인 (2차)**: `/actuator/health`가 DynamoDB 연결 실패 시 503 반환하는 앱 설계 — 외부 의존성 장애가 헬스체크 실패로 전파
- **복구**:
  1. Dockerfile에 `awscli` 추가 → 재빌드/재푸시 (01:16)
  2. `UnicornRentalApp.java` 패치 — DEGRADED 상태에서도 200 반환 (503 → 200)
  3. ECS TG 헬스체크 경로 `/actuator/health` → `/` 변경 (항상 200)
- **소요 시간**: ~53분 (배포 후 최종 해결까지)
- **더 일찍 했어야 했던 것**:
  - **Dockerfile 작성 시** Java 앱 소스를 더 꼼꼼히 분석했어야 함 — `runAwsJsonCommand`로 subprocess 실행하는 패턴을 미리 파악했다면 CLI 포함 필요성을 즉시 인지 가능
  - **로컬 테스트**: `docker run` 후 `curl localhost:8080/actuator/health` 로컬 검증 단계가 없었음 → 배포 전 헬스체크 응답 확인 필수
  - **ECS TG Matcher**: `200-499`로 처음부터 설정했어야 함 (EC2 TG와 동일하게)
  - **헬스체크 설계 검토**: 외부 의존성(DynamoDB) 실패가 헬스체크 실패로 이어지는 설계는 위험 — 헬스체크는 앱 자체 생존 여부만 반영해야 함

---

### 🟡 Issue 4: ECS 마이그레이션 순서 — Private Subnet이 늦게 추가됨

- **발생**: ECS 마이그레이션 계획 수립 시
- **영향**: 없음 (기능적으로는 정상 동작)
- **더 일찍 했어야 했던 것**:
  - Private Subnet + NAT Gateway는 **Quest 1 완료 직후** (00:15~00:20) 바로 추가했어야 함
  - 보안 강화(SSH 제거, 프라이빗 서브넷 이동)는 서비스 기동 직후 가장 먼저 해야 할 작업

---

### 🟡 Issue 5: CloudWatch 대시보드 — ECS 지표 미포함

- **발생**: 대시보드 초기 구성 시 (00:07)
- **영향**: ECS 배포 후 컨테이너 레벨 모니터링 부재 (Container Insights도 01:55에야 활성화)
- **더 일찍 했어야 했던 것**:
  - ECS 마이그레이션 계획이 있었다면 대시보드에 ECS 지표(CPU, Memory, RunningTaskCount)를 미리 포함했어야 함
  - ECS Cluster 생성 시 Container Insights를 즉시 활성화했어야 함 (`unicorn-rental-ecs-task-low` 알람이 데이터 없음으로 ALARM 상태 유지)

---

### 🔴 Issue 6: ECS Task Role 자격증명 — `aws` CLI subprocess 미동작

- **발생**: ECS 배포 후 (01:16~01:45)
- **증상**: `aws` CLI subprocess에서 `Unable to locate credentials` 에러
- **원인 분석**:
  - IAM 권한 자체는 정상 (Task Role에 DynamoDB 권한 있음)
  - ECS Fargate는 `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`로 Task Role 자격증명 주입
  - Java `ProcessBuilder`는 환경변수를 상속하므로 이론상 동작해야 함
  - 실제 원인: 앱 설계 문제 — `/actuator/health`가 DynamoDB 연결 실패 시 503 반환
  - 503은 ALB TG Matcher `200-499` 범위 밖 → unhealthy 루프
- **해결**:
  - `UnicornRentalApp.java`: DEGRADED 상태에서도 200 반환 (503 → 200)
  - ECS TG 헬스체크 경로 `/actuator/health` → `/` (항상 200)
- **더 일찍 했어야 했던 것**:
  - **로컬 테스트 필수**: `docker run` 후 실제 응답 코드 확인 → 503 즉시 발견 가능
  - **헬스체크 설계 검토**: 외부 의존성(DynamoDB) 실패가 헬스체크 실패로 이어지는 설계는 위험
  - **TG Matcher 범위**: 처음부터 `200-499`로 설정했어야 함 (ALB 제약 인지 필요)

---

### 🟡 Issue 7: DynamoDB PITR 미적용 상태 (decision-log 불일치)

- **발생**: 01:55 운영 점검 중 발견
- **증상**: 00:37에 PITR 활성화 기록했으나 실제 미적용 상태
- **원인**: CLI 명령 실행 후 결과 검증 없이 완료로 기록
- **복구**: 01:55 재활성화 후 ENABLED 확인
- **더 일찍 했어야 했던 것**:
  - 중요 설정 변경 후 반드시 `describe` 명령으로 적용 여부 검증

---

## 잘 된 것들 (Keep)

- Kiro를 활용한 빠른 인프라 탐색 및 CDK 코드 생성
- 모든 인프라 변경을 IaC(CDK)로 관리
- decision-log.md로 실시간 의사결정 기록
- ALB weighted_random + anomaly_mitigation 적용으로 포화 인스턴스 자동 감지
- DynamoDB Streams + Lambda 파이프라인 구축
- 보안 강화 (SSH 제거, ALB 헤더 보호, DynamoDB 삭제 보호/PITR)
- ECS 마이그레이션 완료 — 가중치 기반 무중단 순차 전환 (EC2 100% → 70/30 → 50/50 → ECS 100%)
- k6 Load 테스트로 ECS 전환 후 안정성 검증 (~65 req/s, p99 1~16ms, 5xx 0건)

---

## 개선 액션 아이템

| 우선순위 | 항목 | 조치 |
|---|---|---|
| P0 | Dockerfile 작성 시 앱 소스 전체 분석 필수 | subprocess 실행 패턴 확인 → 의존성 포함 |
| P0 | 컨테이너 로컬 테스트 단계 추가 | `docker run` 후 헬스체크 엔드포인트 직접 확인 |
| P0 | 헬스체크는 외부 의존성과 분리 | `/health`는 앱 생존 여부만 반영, 외부 의존성 실패는 별도 엔드포인트로 노출 |
| P1 | 인프라 탐색 체크리스트 표준화 | ALB Listener, TG 헬스, ASG 상태를 첫 번째로 확인 |
| P1 | 부하 테스트 전 스케일 아웃 선제 적용 | 테스트 전 ASG desired 확장 + 알고리즘 변경 완료 |
| P1 | 설정 변경 후 검증 필수 | PITR, Streams 등 중요 설정은 `describe`로 즉시 확인 |
| P2 | Private Subnet을 초기 인프라 구성에 포함 | 보안 기본값으로 프라이빗 서브넷 사용 |
| P2 | 대시보드에 ECS 지표 추가 | ECS CPU/Memory/TaskCount 위젯 포함 |
| P2 | ECS Cluster 생성 시 Container Insights 즉시 활성화 | 알람 데이터 공백 방지 |
