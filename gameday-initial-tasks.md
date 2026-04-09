# GameDay 초기 작업 지시서

## 목적

이 문서는 GameDay 시작 전에 반드시 먼저 수행해야 할 초기 작업을 정리한 지시서다.
핵심 목표는 현재 운영 아키텍처를 실제 AWS 환경 기준으로 확인하고, 그 결과를 바탕으로 CDK 형상을 먼저 만든 뒤, CloudWatch 대시보드와 핵심 알람 및 Slack 알림 경로를 빠르게 준비하는 것이다.
특히 작업 0 에서는 사용자가 리소스 지형을 직관적으로 파악할 수 있도록 ALB, EC2, ECS, DynamoDB, RDS 순의 대시보드 골격을 CDK 로 먼저 정의해야 한다.

이 문서는 discovery-first 원칙을 따른다.

- 현재 아키텍처를 이미 안다고 가정하지 않는다.
- 저장소의 문서나 모의 자산을 정답처럼 취급하지 않는다.
- 실제 AWS 리소스를 먼저 확인하고, 그 다음에 코드와 배포 경로를 역추적한다.
- 모든 인프라 형상은 실제 리소스를 만들기 전에 먼저 CDK 형상으로 정의한다.

## 작업 전 필수 원칙

1. 인프라 생성, 수정, 확장 작업은 반드시 CDK 형상을 먼저 만든 뒤 진행한다.
2. 모니터링 스택도 예외가 아니며, CloudWatch Dashboard, Alarm, SNS, Lambda, AWS Chatbot 설정은 모두 CDK 로 먼저 정의한다.
3. 아키텍처 파악은 AWS CLI 기반의 실제 리소스 확인을 우선한다.
4. 소스코드 위치, 릴리즈 바이너리 배치 위치, 실행 경로는 추측하지 않고 실제 배포 경로에서 확인한다.
5. EC2 기반 런타임이 있으면 systemd 유닛과 restart 정책을 확인해 self-healing 구성이 되어 있는지 반드시 확인한다.
6. 최종 문서에는 확인한 사실과 추론을 분리해서 적는다.
7. 초기 대시보드는 특정 리소스 하나를 고정해 필터링하지 않고, ALB, EC2, ECS, DynamoDB, RDS 각 카테고리에 속한 전체 리소스의 중요 지표가 보이도록 설계한다.

## 초기 작업 순서

0. 대시보드 골격을 CDK 로 먼저 정의
1. AWS CLI 기반 아키텍처 파악
2. 소스코드, 릴리즈 바이너리, 실행 경로 확인
3. 현재/목표 인프라의 CDK 기준 형상 작성
4. 모니터링 스택 실제 리소스 매핑 및 보강
5. 핵심 알람과 SNS 기반 알림 경로 구성
6. 검증 및 남은 공백 정리

---

## 작업 0. 대시보드 골격을 CDK 로 먼저 정의

### 목표

실제 리소스 생성이나 후속 모니터링 작업에 앞서, 운영자가 서비스 전반의 리소스를 직관적으로 파악할 수 있는 CloudWatch Dashboard 골격을 CDK 로 먼저 정의한다.

### 필수 원칙

1. 대시보드는 가장 먼저 CDK 형상으로 정의한다.
2. 대시보드의 상하 배치는 ALB, EC2, ECS, DynamoDB, RDS 순서를 따른다.
3. 각 레이어는 특정 리소스 하나를 고정해서 필터링하지 않는다.
4. 각 레이어는 해당 유형에 속한 모든 리소스의 중요 지표를 한 번에 볼 수 있게 설계한다.
5. 실제 리소스 이름과 metric dimension 연결은 후속 작업에서 보강하되, 레이어 구조와 표시 원칙은 먼저 고정한다.

### 포함해야 할 레이어

- ALB
- EC2
- ECS
- DynamoDB
- RDS

### 표시 원칙

- 사용자가 특정 리소스 이름을 미리 알지 못해도 현재 운영 리소스 구성을 직관적으로 파악할 수 있어야 한다.
- 각 카테고리의 위젯은 단일 리소스 중심이 아니라 전체 리소스 집합을 보여주는 형태여야 한다.
- 중요 지표는 가용성, 오류, 지연, 용량 관점으로 우선 배치한다.
- 아직 실제 리소스 연결이 끝나지 않았더라도 CDK 상의 대시보드 골격은 먼저 존재해야 한다.

### 기대 산출물

- CloudWatch Dashboard CDK 정의
- ALB, EC2, ECS, DynamoDB, RDS 레이어 골격
- 특정 리소스 비필터링 원칙이 반영된 위젯 설계 기준

---

## 작업 1. AWS CLI 기반 아키텍처 파악

### 목표

실제 AWS 리소스를 기준으로 현재 트래픽 진입점, 호출 토폴로지, 런타임 위치, 데이터 저장소를 확인한다.

### 반드시 AWS CLI 로 확인할 리소스

- ALB, Listener, Target Group
- EC2 인스턴스, Auto Scaling Group, Launch Template
- ECS Cluster, Service, Task Definition
- DynamoDB Table
- RDS Instance 또는 Cluster
- CloudFormation Stack 과 주요 Output
- CloudWatch Dashboard, Alarm, SNS Topic

### 확인해야 할 핵심 질문

1. 외부 트래픽은 어느 ALB 또는 엔드포인트로 유입되는가
2. ALB 뒤에서 실제 요청을 처리하는 런타임은 EC2 인가, ECS 인가, 혼합인가
3. 애플리케이션 호출 순서상 EC2, ECS, DynamoDB, RDS 는 어떤 관계를 가지는가
4. 실제 운영 경로에서 병목 또는 단일 실패 지점은 어디인가

### 기대 산출물

- 현재 요청 흐름의 텍스트 아키텍처 설명
- 트래픽 유입부터 데이터 저장소까지의 호출 토폴로지
- 확인한 실제 리소스 이름, ARN, ID 목록
- 현재 운영 경로의 취약 지점 후보

---

## 작업 2. 소스코드, 바이너리, 실행 경로 확인

### 목표

운영 중인 애플리케이션의 소스코드 위치, 릴리즈 바이너리 배치 위치, 부팅 및 실행 방식을 실제 배포 경로 기준으로 확인한다.

### 반드시 확인할 항목

1. 저장소 안에서 실제 운영 소스코드가 위치한 경로
2. 빌드 결과물 또는 릴리즈 바이너리가 배치되는 위치
3. EC2 경로가 있으면 Launch Template UserData 에서 바이너리 다운로드 경로와 로컬 배치 경로
4. EC2 경로가 있으면 systemd 유닛 파일, `Restart=` 정책, 프로세스 재기동 방식
5. ECS 경로가 있으면 container image, entrypoint, command, environment 주입 방식
6. 배포가 수동 업로드인지, S3 다운로드인지, CI/CD 파이프라인인지

### self-healing 확인 기준

- EC2 인스턴스에서 애플리케이션이 systemd 로 관리되는가
- systemd 에 자동 재시작 정책이 있는가
- 프로세스 장애 시 서비스 단위 복구와 인스턴스 단위 복구가 각각 어떻게 이루어지는가

### 기대 산출물

- 소스코드 위치
- 릴리즈 바이너리 위치
- 배포 방식 요약
- 런타임별 실행 명령 요약
- EC2 systemd self-healing 유무와 근거

---

## 작업 3. CDK 기준 형상 먼저 작성

### 목표

이후 만들거나 수정할 모든 인프라를 실제 적용 전에 CDK 형상으로 먼저 정의해 기준 상태와 목표 상태를 관리 가능하게 만든다.

### 필수 원칙

1. 새 리소스를 만들기 전에 해당 리소스의 CDK 형상을 먼저 작성한다.
2. 기존 운영 리소스를 확장하거나 교체할 때도 변경 전 기준 상태를 CDK 관점에서 정리한다.
3. 모니터링 스택은 별도 스택 또는 명확한 구성 단위로 분리해 관리한다.

### 최소 포함 대상

- CloudWatch Dashboard
- CloudWatch Alarm
- SNS Topic
- Slack 연동용 Lambda
- AWS Chatbot SlackChannelConfiguration

### 기대 산출물

- 현재/목표 리소스를 반영한 CDK 경로
- 어떤 리소스를 어느 스택에서 관리하는지에 대한 구분
- 이후 배포 및 검증에 사용할 synth 가능 상태의 IaC

---

## 작업 4. 모니터링 스택 실제 리소스 매핑 및 보강

### 목표

작업 0 에서 먼저 정의한 CloudWatch Dashboard 골격에 실제 운영 리소스를 연결하고, 운영자가 트래픽 유입과 내부 호출 흐름을 한 화면에서 위에서 아래로 추적할 수 있게 보강한다.

### 대시보드 필수 요구사항

1. CloudWatch Dashboard 는 CDK 로 생성한다.
2. 위젯은 트래픽 인입 및 호출 토폴로지 순서대로 상하 배치한다.
3. 최소 레이어는 다음 순서를 따른다.
   - ALB
   - EC2
   - ECS
   - DynamoDB
   - RDS
4. 각 레이어는 특정 리소스 하나만 필터링하지 않고, 가능하면 해당 카테고리의 실제 리소스 전부를 포함한다.
5. 현재 사용하지 않는 레이어가 있더라도 제거하지 말고 placeholder 를 둔다.
6. 지표는 가용성, 오류, 지연, 용량 관점으로 묶어 읽기 쉽게 배치한다.

### 권장 지표 예시

- ALB: RequestCount, HTTPCode_ELB_5XX_Count, HTTPCode_Target_5XX_Count, TargetResponseTime, HealthyHostCount, UnHealthyHostCount
- EC2: CPUUtilization, StatusCheckFailed, NetworkIn, NetworkOut
- ECS: CPUUtilization, MemoryUtilization, RunningTaskCount 또는 desired 대비 running 상태
- DynamoDB: SuccessfulRequestLatency, ThrottledRequests, SystemErrors, ConsumedReadCapacityUnits, ConsumedWriteCapacityUnits
- RDS: CPUUtilization, DatabaseConnections, FreeStorageSpace, FreeableMemory, ReadLatency, WriteLatency

### 기대 산출물

- Dashboard 이름
- 위젯 배치 원칙 설명
- 현재 비어 있는 placeholder 영역
- 실제 리소스와 metric dimension 근거

---

## 작업 5. 알람 및 Slack 알림 경로 구성

### 목표

CloudWatch Alarm 을 구성하고, 알림 경로는 SNS 를 중심으로 Lambda -> Slack 과 AWS Chatbot -> Slack 을 병렬로 연결한다.

### 알림 경로 원칙

1. 알람 발행 대상용 SNS Topic 을 먼저 만든다.
2. 같은 SNS Topic 에 대해 두 개의 Slack 전달 경로를 병렬 구성한다.
3. 첫 번째 경로는 Lambda 가 SNS 이벤트를 받아 Slack 으로 전달하는 방식이다.
4. 두 번째 경로는 AWS Chatbot 이 같은 SNS Topic 을 구독해 Slack 으로 전달하는 방식이다.
5. 두 경로 중 하나가 실패해도 다른 경로가 유지되도록 설계한다.
6. 모든 알림 리소스도 CDK 로 먼저 정의한다.

### 반드시 설정할 중요 알람

#### 트래픽 유입 중단

- ALB RequestCount 급감 또는 0 지속
- Synthetic traffic 사용 시 canary 실패와 함께 판단 가능하도록 설계

#### ALB 호스트 단절

- Target Group HealthyHostCount 감소
- UnHealthyHostCount 증가
- 필요 시 ECS running task 감소 또는 EC2 status check 실패와 연계

#### 레이턴시 증가

- ALB TargetResponseTime 증가
- 필요 시 RDS ReadLatency/WriteLatency 또는 DynamoDB SuccessfulRequestLatency 와 함께 상관 확인

### 추가 권장 알람

- ALB 5xx 증가
- EC2 StatusCheckFailed
- ECS desired 대비 running task 감소
- DynamoDB ThrottledRequests 또는 SystemErrors
- RDS CPUUtilization, DatabaseConnections, FreeStorageSpace, FreeableMemory 이상

### severity 원칙

- `Critical`: GameDay 중 즉시 대응이 필요한 서비스 유입 중단, 호스트 단절, 심각한 레이턴시 증가
- `Warning`: 성능 악화 조짐, 용량 압박, 오류 증가 초기 신호

### 기대 산출물

- SNS Topic 이름
- Lambda -> Slack 경로 구성 설명
- AWS Chatbot -> Slack 경로 구성 설명
- 필수 알람 목록과 threshold rationale
- end-to-end 검증 절차

---

## 검증 기준

1. AWS CLI 조사 결과와 문서 내용이 일치해야 한다.
2. CDK 경로에서 synth 가 성공해야 한다.
3. Dashboard 에 ALB, EC2, ECS, DynamoDB, RDS 레이어가 순서대로 존재해야 한다.
4. SNS Topic 과 두 개의 Slack 전달 경로가 병렬 구성되어야 한다.
5. 다음 중요 알람은 반드시 존재해야 한다.
   - 트래픽 유입 중단
   - ALB 호스트 단절
   - 레이턴시 증가
6. EC2 경로가 있으면 systemd self-healing 확인 결과가 문서에 있어야 한다.

## 최종 결과 보고 형식

1. 확인한 사실
2. 수정한 파일
3. 생성 또는 수정한 CDK 형상
4. 검증한 항목
5. 남아 있는 공백
6. 다음 작업으로 넘길 입력
