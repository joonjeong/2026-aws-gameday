# Unicorn Rental Complex 아키텍처 분석

**분석 일시**: 2026-04-08 17:20 KST  
**분석 대상**: 실제 배포 환경 (ap-northeast-2)  
**분석 방법**: AWS API 조회 + 코드 역추적

---

## 1. 전체 요청 흐름

```
Internet → ALB (port 80) → Target Group (port 8080) → EC2 Instances (ASG)
                                                            ↓
                                                    Spring Boot App
                                                    ↙            ↘
                                        DynamoDB (sessions)   RDS Postgres (rentals)
```

**진입점**: `unicorn-rental-complex-alb-593203897.ap-northeast-2.elb.amazonaws.com`

---

## 2. 실제 런타임 구성

### 현재 상태: **EC2 기반 (ECS 없음)**

- **Auto Scaling Group**: `unicorn-rental-complex-asg`
  - Min: 2, Desired: 2, Max: 4
  - Instance Type: `t3.small`
  - Launch Template: `unicorn-rental-complex-lt` (version 2)
  - Health Check: ELB, Grace Period 300s
  - CPU Target Tracking: 60% 기준 스케일링

- **현재 인스턴스 상태** (2026-04-08 17:20 기준):
  - `i-0faf72fb8ff19f1f0` (2a): **Healthy** ✅
  - `i-0bed28b2b85599f40` (2b): **Unhealthy** ⚠️
  - `i-0e34619c3bc752d74` (2a): **Terminating** (Unhealthy)

**문제 징후**: 3개 인스턴스 중 1개만 Healthy → 즉시 조사 필요

---

## 3. 네트워크 구조

### VPC: `vpc-0e076602f8086bb01`

**Subnet 구성**:
- **Public Subnets** (2개, 2a/2b): ALB + EC2 인스턴스
- **Private Isolated Subnets** (2개, 2a/2b): RDS Postgres

**보안 그룹**:
- ALB SG (`sg-060191972e6973c99`): 0.0.0.0/0:80 → ALB
- App SG: ALB → EC2:8080, 0.0.0.0/0:22 → EC2 (SSH 전체 개방 ⚠️)
- DB SG (`sg-04b85a0324a91633b`): App SG → RDS:5432

**취약점**:
- ❌ EC2가 Public Subnet에 위치 (Private Subnet 권장)
- ❌ SSH 포트 전체 개방 (보안 위험)
- ❌ HTTP만 지원 (HTTPS 미적용)

---

## 4. 데이터 저장소

### DynamoDB
- **테이블**: `unicorn-rental-complex-sessions`
- **용도**: 사용자 세션 저장 (TTL 8시간)
- **Partition Key**: `sessionId`
- **Billing**: PAY_PER_REQUEST
- **PITR**: 활성화

### RDS Postgres
- **Identifier**: `unicornrentalcomplexappli-postgresdatabase0a8a7373-pao9fozmhtg5`
- **Endpoint**: `*.cvcmwys22jux.ap-northeast-2.rds.amazonaws.com:5432`
- **Engine**: PostgreSQL 16.12
- **Instance**: `db.t3.micro`
- **Database**: `unicorn_rental`
- **Username**: `unicorn_app`
- **Multi-AZ**: ❌ (단일 AZ, 2b)
- **Storage**: 100GB gp3 (3000 IOPS, 125 MB/s)
- **Backup**: 1일 보관
- **Encryption**: ❌ (미암호화)

**테이블 구조** (schema.sql 기준):
- `rentals`: 대여 가능 자산 목록 (rental_id, asset_name, category, status, hourly_rate)
- `rental_orders`: 대여 주문 이력 (order_id, rental_id, customer_name, session_id, status, created_at, returned_at)

---

## 5. 부팅/배포 흐름

### S3 Artifact Bucket
- **버킷**: `unicorn-rental-complex-artifacts`
- **Artifact 경로**: `s3://unicorn-rental-complex-artifacts/artifacts/unicorn-rental-complex-app.jar`
- **소스 코드 경로**: `s3://unicorn-rental-complex-artifacts/source/app/`

### EC2 UserData 부팅 시퀀스

1. **패키지 설치**: `awscli`, `jq`, `java-17-amazon-corretto-headless`
2. **Artifact 다운로드**: S3에서 JAR 파일 다운로드 → `/opt/unicorn-rental-complex/app/`
3. **Secrets Manager 조회**: RDS 비밀번호 조회 → 환경변수 주입
4. **systemd 서비스 등록**: `/etc/systemd/system/unicorn-rental-complex.service`
5. **서비스 시작**: `systemctl enable --now unicorn-rental-complex.service`
6. **Health Check**: 15초 동안 서비스 활성화 대기

**환경변수** (`/etc/unicorn-rental-complex.env`):
```bash
PORT=8080
AWS_REGION=ap-northeast-2
SPRING_DATASOURCE_URL=jdbc:postgresql://<RDS_ENDPOINT>:5432/unicorn_rental
SPRING_DATASOURCE_USERNAME=unicorn_app
SPRING_DATASOURCE_PASSWORD=<from_secrets_manager>
SESSION_TABLE_NAME=unicorn-rental-complex-sessions
SESSION_TTL_HOURS=8
```

**systemd 서비스**:
```ini
[Service]
Type=simple
User=ec2-user
ExecStart=/usr/bin/java -XX:+ExitOnOutOfMemoryError -jar /opt/unicorn-rental-complex/app/unicorn-rental-complex-app.jar
Restart=always
RestartSec=5
```

---

## 6. 애플리케이션 엔드포인트

### Spring Boot Actuator
- **Health Check**: `/actuator/health` (ALB Target Group 사용 중)
- **Exposed Endpoints**: `health`, `info`
- **Health Indicators**: 
  - DB connectivity
  - DynamoDB session table status

### API 엔드포인트

#### 세션 관리
- `POST /api/sessions` - 세션 생성 (userName 필수)
- `GET /api/sessions/current` - 현재 세션 조회
- `DELETE /api/sessions/current` - 세션 삭제

#### 대여 관리
- `GET /api/rentals` - 대여 가능 자산 목록 (인증 불필요)
- `GET /api/orders` - 내 주문 목록 (세션 필요)
- `POST /api/orders/reserve` - 자산 예약 (세션 필요, rentalId 필수)
- `POST /api/orders/return` - 자산 반납 (세션 필요, rentalId 필수)

**인증 방식**: Cookie 기반 (`X-Session-Token`)

---

## 7. 현재 관측 자산

### CloudWatch 알람
- ✅ **ASG CPU High**: 60% 초과 시 스케일 아웃 (Target Tracking)
- ✅ **ASG CPU Low**: 42% 미만 시 스케일 인 (Target Tracking)

### CloudWatch 대시보드
- ❌ **없음** (생성 필요)

### SNS 토픽
- ❌ **없음** (알람 알림 채널 없음)

### Application Signals / X-Ray
- ❌ **미적용** (Java APM 없음)

---

## 8. GameDay 중 가장 취약한 실패 지점

### Critical (즉시 장애)
1. **RDS 단일 AZ** → AZ 장애 시 전체 서비스 중단
2. **Unhealthy 인스턴스 2개** → 현재 1개만 트래픽 처리 중
3. **ALB Health Check 실패** → 인스턴스 교체 반복 가능성
4. **DynamoDB 세션 의존성** → 테이블 장애 시 로그인 불가

### High (성능 저하)
5. **t3.small 인스턴스** → CPU/메모리 부족 가능성
6. **Public Subnet EC2** → 네트워크 보안 취약
7. **HTTP만 지원** → 중간자 공격 가능
8. **SSH 전체 개방** → 무단 접근 위험

### Medium (운영 리스크)
9. **모니터링 대시보드 없음** → 장애 감지 지연
10. **SNS 알림 없음** → 알람 발생 시 통지 불가
11. **Application Signals 없음** → 애플리케이션 레벨 가시성 부족
12. **RDS 암호화 없음** → 데이터 보안 취약

---

## 9. 대시보드와 알람이 우선 커버해야 할 리소스 순위

### 1순위 (가용성)
- ALB Unhealthy Host Count
- ALB Target Response Time
- ALB 5xx Error Count
- ASG In-Service Instance Count

### 2순위 (성능)
- EC2 CPU Utilization
- RDS CPU Utilization
- RDS Database Connections
- DynamoDB Throttled Requests

### 3순위 (용량)
- RDS Free Storage Space
- RDS Free Memory
- DynamoDB Consumed Read/Write Capacity

### 4순위 (의존성)
- DynamoDB System Errors
- RDS Read/Write Latency

---

## 10. 현재 구성의 개선 포인트 체크리스트

- [ ] EC2를 Private Subnet으로 이동
- [ ] ALB에 HTTPS 리스너 추가 (ACM 인증서)
- [ ] SSH 접근을 Systems Manager Session Manager로 전환
- [ ] RDS Multi-AZ 활성화
- [ ] RDS 암호화 활성화 (재생성 필요)
- [ ] CloudWatch 대시보드 생성
- [ ] SNS 토픽 + 알람 연동
- [ ] Slack 알림 채널 구성 (AWS Chatbot)
- [ ] CloudWatch Application Signals 적용
- [ ] WAF 규칙 적용 (rate limiting, SQL injection 방어)
- [ ] Auto Scaling 정책 튜닝 (현재 CPU만 사용)
- [ ] RDS 백업 보관 기간 연장 (1일 → 7일)
- [ ] CloudWatch Logs 수집 (애플리케이션 로그)
- [ ] X-Ray 트레이싱 활성화

---

## 11. 현재 구성의 취약한 부분 체크리스트

### 보안
- ⚠️ SSH 포트 전체 개방 (0.0.0.0/0:22)
- ⚠️ EC2가 Public Subnet에 위치
- ⚠️ HTTPS 미적용 (HTTP만 지원)
- ⚠️ RDS 암호화 미적용
- ⚠️ WAF 미적용

### 가용성
- 🔴 RDS 단일 AZ (Multi-AZ 미활성화)
- 🔴 현재 Unhealthy 인스턴스 2개 (66% 장애율)
- ⚠️ RDS 백업 1일만 보관

### 관측성
- 🔴 CloudWatch 대시보드 없음
- 🔴 SNS 알림 채널 없음
- 🔴 Application Signals 미적용
- 🔴 CloudWatch Logs 미수집
- ⚠️ X-Ray 트레이싱 없음

### 성능
- ⚠️ t3.small 인스턴스 (CPU 제약)
- ⚠️ db.t3.micro RDS (메모리 제약)
- ⚠️ Auto Scaling이 CPU만 기준

---

## 12. 아키텍처 현대화 가능성 평가

### ECS/Fargate 전환
**필요성**: 중간  
**이유**: 
- 현재 EC2 기반 구성이 작동 중
- 컨테이너화 시 배포 속도 향상
- Fargate로 인프라 관리 부담 감소

**선행 작업**:
- Dockerfile 작성 (이미 `solution/trial2/docker/Dockerfile` 존재)
- ECR 리포지토리 생성
- ECS 클러스터 + 서비스 정의

### Private Subnet 전환
**필요성**: 높음  
**이유**:
- 현재 EC2가 Public Subnet에 노출
- SSH 포트 전체 개방 보안 위험
- NAT Gateway 추가 필요

### HTTPS 종단
**필요성**: 높음  
**이유**:
- 현재 HTTP만 지원
- 세션 쿠키 탈취 위험
- ACM 인증서 + Route53 필요

### 운영 접근 통제
**필요성**: 높음  
**이유**:
- SSH 포트 전체 개방
- Systems Manager Session Manager 권장

### 배포 자동화
**필요성**: 중간  
**이유**:
- 현재 S3 + UserData 기반 수동 배포
- CodePipeline + CodeDeploy 도입 고려

### 관측성 표준화
**필요성**: 높음  
**이유**:
- 현재 대시보드/알람/APM 없음
- CloudWatch Application Signals 즉시 적용 필요

---

## 13. CDK Dump 필요성

**현대화 작업 전 반드시 현재 인프라를 CDK로 dump하여 기준 상태를 남겨야 함**

**Dump 대상**:
- VPC + Subnet + Security Group
- ALB + Target Group + Listener
- ASG + Launch Template
- RDS Instance
- DynamoDB Table
- S3 Bucket
- IAM Role

**도구**: `cdk import` 또는 `former2` 사용 가능

---

## 14. GameDay 시작 전 체크리스트 10개

1. [ ] **Unhealthy 인스턴스 원인 파악** → CloudWatch Logs, systemd journal 확인
2. [ ] **CloudWatch 대시보드 생성** → ALB, EC2, RDS, DynamoDB 메트릭
3. [ ] **CloudWatch 알람 생성** → Unhealthy Host, 5xx, RDS CPU, DynamoDB Throttle
4. [ ] **SNS 토픽 + Slack 연동** → 알람 알림 채널 구성
5. [ ] **RDS Multi-AZ 활성화** → 단일 AZ 장애 대비
6. [ ] **Auto Scaling 정책 검증** → 부하 테스트로 스케일링 동작 확인
7. [ ] **Health Check 경로 검증** → `/actuator/health` 응답 확인
8. [ ] **DynamoDB 용량 모드 확인** → PAY_PER_REQUEST 유지 (트래픽 급증 대비)
9. [ ] **RDS 연결 풀 설정 확인** → HikariCP max-pool-size=10 적절성 검토
10. [ ] **k6 스모크 테스트 실행** → 전체 엔드포인트 정상 동작 확인

---

## 15. 확인에 사용한 리소스

### AWS API 조회
- `aws elbv2 describe-load-balancers`
- `aws elbv2 describe-target-groups`
- `aws autoscaling describe-auto-scaling-groups`
- `aws ec2 describe-launch-templates`
- `aws rds describe-db-instances`
- `aws dynamodb list-tables`
- `aws cloudwatch describe-alarms`
- `aws cloudwatch list-dashboards`
- `aws sns list-topics`
- `aws ecs list-clusters`
- `aws s3api list-buckets`
- `aws cloudformation list-stacks`

### 코드 근거
- `bootstrap/unicorn-rental-complex/cdk/lib/bootstrap/application.ts`
- `bootstrap/unicorn-rental-complex/cdk/lib/bootstrap/user-data.ts`
- `bootstrap/unicorn-rental-complex/cdk/lib/bootstrap/network.ts`
- `bootstrap/unicorn-rental-complex/cdk/userdata/bootstrap.sh.tmpl`
- `bootstrap/unicorn-rental-complex/cdk/userdata/service.service.tmpl`
- `bootstrap/unicorn-rental-complex/cdk/userdata/service.env.tmpl`
- `bootstrap/unicorn-rental-complex/app/src/main/resources/application.properties`
- `bootstrap/unicorn-rental-complex/app/src/main/resources/schema.sql`
- `bootstrap/unicorn-rental-complex/app/src/main/java/com/gameday/unicornrental/web/RentalController.java`
- `bootstrap/unicorn-rental-complex/app/src/main/java/com/gameday/unicornrental/web/SessionController.java`
- `bootstrap/unicorn-rental-complex/app/src/main/java/com/gameday/unicornrental/rental/RentalRepository.java`

---

**분석 완료**: 2026-04-08 17:20 KST
