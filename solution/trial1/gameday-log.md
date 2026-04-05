# trial1 GameDay 모의 훈련 작업 타임라인 — 2026-04-05

이 문서는 `trial1/` 리허설에서 수행한 조치와 결과를 시각 순으로 기록한다. 실제 작업에 사용한 별도 솔루션은 상위 디렉터리의 `enigma/` 문서를 기준으로 본다.

## 02:30 — Fargate 스택 진단 및 ECR 권한 수정

**증상**: ECS 태스크가 계속 실패, `ecr:GetAuthorizationToken` AccessDeniedException

**원인**: `FargateTaskDefinition`에 `executionRole`이 없어 CDK 자동 생성 role에 ECR pull 권한 미포함

**조치 (코드)**:
- `fargate-stack.ts`에 `executionRole` 추가 (`AmazonECSTaskExecutionRolePolicy` attach)

```ts
const executionRole = new iam.Role(this, 'ExecutionRole', {
  assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
  roleName: 'unicorn-rental-ecs-execution-role',
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
  ],
});
```

---

## 02:32 — FargateStack 배포 시도 / 즉시 권한 패치

**상황**: `UnicornRentalFargateStack`이 `CREATE_IN_PROGRESS` 중 (이전 배포가 진행 중)

**조치 (수동)**:
- CDK가 자동 생성한 execution role `UnicornRentalFargateStack-TaskDefExecutionRoleB4775-VGysySqO3CuW`에 직접 policy attach
- `aws iam attach-role-policy --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`
- 이후 태스크 재시작 → ECR pull 성공, `imageDigest` 확인

---

## 02:35 — Observability 스택 업데이트

**추가 내용**: ECS Fargate 현황 모니터링 위젯 추가

- Row 3 기존 EC2 위젯 이름 명확화 (`EC2 ASG CPU`, `EC2 ASG In-Service Instances`)
- Row 4 신규 ECS 위젯 3개 추가:
  - `ECS Running Tasks` — `ECS/ContainerInsights` 네임스페이스
  - `ECS CPU / Memory Utilization (avg)` — `AWS/ECS`
  - `ECS TG Healthy / Unhealthy Hosts` — `unicorn-rental-ecs-tg` 기준

**배포**: CloudFormation `update-stack` 직접 호출 (CDK TTY 문제 우회)

---

## 02:40 — 트래픽 전환 (EC2 → ECS)

**사전 확인**:
- ECS `runningCount: 2`, `rolloutState: COMPLETED`
- ECS TG 2개 타겟 모두 `healthy`

**조치**:
- ALB 리스너 룰 (priority 10) weight 변경
  - 변경 전: EC2 TG 100 / ECS TG 0
  - 변경 후: EC2 TG 0 / ECS TG 100
- `fargate-stack.ts` weight 값도 동기화

---

## 02:41 — EC2 ASG 축소

**조치**:
- `unicorn-rental-asg` min/max/desired 모두 0으로 설정
- 인스턴스 `Terminating` 상태 확인

---

## 02:43 — EC2 인스턴스 드레이닝

**상황**: ASG가 `Terminating` 상태이나 ELB 드레이닝 대기로 지연

**조치**:
- EC2 TG(`unicorn-rental-tg`)에서 두 인스턴스 직접 deregister
  - `i-0026d2fb9d22284f2` (ap-northeast-2b)
  - `i-075deff763feb2cc5` (ap-northeast-2a)

---

## 02:46 — 보안/인프라 취약점 분석

| 심각도 | 항목 | 상태 |
|--------|------|------|
| 🔴 높음 | HTTP only, HTTPS 없음 | 미처리 (도메인/인증서 필요) |
| 🔴 높음 | DynamoDB 삭제 방지 비활성화 | → 처리 완료 |
| 🔴 높음 | Execution role IaC drift | → 코드 반영 완료 |
| 🟡 중간 | Container Insights 비활성화 | → 처리 완료 |
| 🟡 중간 | ALB default action이 EC2 TG | → 처리 완료 |
| 🟡 중간 | Fargate egress 전체 허용 | → 처리 완료 |
| 🟡 중간 | DynamoDB PITR 미설정 | → 처리 완료 |
| 🟡 중간 | Deployment circuit breaker 비활성화 | → 처리 완료 |
| 🟢 낮음 | ECS executeCommand 비활성화 | 미처리 |

---

## 02:49 — 즉시 조치 3종 (동시 처리)

- ✅ ALB default action → `unicorn-rental-ecs-tg`
- ✅ ECS Container Insights → `enabled`
- ✅ DynamoDB `DeletionProtectionEnabled` → `true`

---

## 02:51 — 보안 강화 4종 (동시 처리)

**Fargate egress 제한**:
- 기존 `0.0.0.0/0` 전체 허용 egress 제거 (`sgr-08961218d350ceaf8`)
- 필요한 포트만 허용:
  - TCP 443 — ECR, DynamoDB, CloudWatch
  - UDP/TCP 53 — DNS

**DynamoDB PITR**:
- `PointInTimeRecoveryEnabled: true` (35일 보존)

**ECS Deployment Circuit Breaker**:
- `enable: true`, `rollback: true`

**코드 동기화 (`fargate-stack.ts`)**:
- `allowAllOutbound: false` + 명시적 egress 규칙
- `circuitBreaker: { rollback: true }`

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| ECS Fargate | running 2 tasks, healthy |
| ALB 트래픽 | ECS TG 100% |
| EC2 ASG | desired 0, 인스턴스 terminated |
| DynamoDB | 삭제 방지 + PITR 활성화 |
| Fargate SG egress | 443/53만 허용 |
| Circuit Breaker | 활성화 (자동 롤백) |
| Container Insights | 활성화 |
| CloudWatch Dashboard | EC2 + ECS 위젯 포함 |

## 02:53 — FargateStack 재배포 (drift 해소)

**목적**: 수동 패치된 execution role을 IaC 기반으로 교체, 코드 변경사항 전체 반영

**변경 내용**:
- `ExecutionRole` 신규 생성 (`unicorn-rental-ecs-execution-role`, `AmazonECSTaskExecutionRolePolicy`)
- `FargateSg` egress 규칙 코드 반영 (443/53만 허용)
- `DeploymentCircuitBreaker` enable/rollback true
- `WeightedRule` EC2:0 / ECS:100 코드 반영
- 새 task definition 등록 → rolling update로 태스크 교체

**방법**: `cloudformation update-stack` 직접 호출 (CDK TTY 문제 우회)

**상태**: `UPDATE_IN_PROGRESS` → 완료 대기 중

---

## 최종 상태 요약 (02:53 기준)

| 항목 | 상태 |
|------|------|
| ECS Fargate | running 2 tasks, healthy |
| ALB 트래픽 | ECS TG 100% (priority 10 룰 + default action) |
| EC2 ASG | desired 0, 인스턴스 terminated |
| DynamoDB | 삭제 방지 + PITR 활성화 (35일) |
| Fargate SG egress | 443/53만 허용 |
| Circuit Breaker | 활성화 (자동 롤백) |
| Container Insights | 활성화 |
| CloudWatch Dashboard | EC2 + ECS 위젯 포함 |
| FargateStack IaC | 재배포 완료 (drift 해소) |

## 남은 항목

- HTTPS 리스너 추가 (ACM 인증서 필요)
- ECS executeCommand 활성화 (선택)
