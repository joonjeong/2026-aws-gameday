# Unicorn Rental Gameday Solution

이 디렉토리는 `Unicorn Rental` 시나리오용 AWS Gameday 산출물을 모아둔 작업 공간이다. 기존 EC2 기반 서비스를 관찰 가능하게 만들고, DynamoDB 이벤트 처리와 ECS 마이그레이션까지 진행한 결과물이 포함되어 있다.

현재 코드는 범용 템플릿이 아니라 특정 AWS 환경에 맞춰져 있다. 여러 CDK 스택에서 계정, 리전, VPC ID, ALB ARN, Target Group ARN, Subnet ID 같은 값이 하드코딩되어 있으므로 그대로 다른 환경에 재사용하면 동작하지 않는다.

## 현재 구성

- 애플리케이션: Java 21 단일 바이너리 앱
- 진입 트래픽: ALB
- 기존 런타임: EC2 + Auto Scaling Group
- 신규 런타임: ECS Fargate
- 데이터 저장소: DynamoDB `unicorn-rental-orders`
- 관측성: CloudWatch Dashboard, CloudWatch Alarm, SNS
- 검증 도구: `k6` 기반 smoke/load 테스트

자세한 구성도와 변경 이력은 [architecture.md](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/architecture.md)에서 확인할 수 있다.

## 디렉토리 구조

- [cdk-infra](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/cdk-infra): 인프라 관련 CDK 앱. 알람/SNS, ECS용 네트워크, ECS 서비스 스택 포함
- [cdk-dashboard](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/cdk-dashboard): CloudWatch Dashboard 및 ECS 관련 알람 스택
- [docker](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/docker): Java 애플리케이션 소스와 컨테이너 이미지 빌드 파일
- [k6](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/k6): 부하 테스트 시나리오
- [smoke-test.js](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/smoke-test.js): 빠른 연결 확인용 k6 스크립트
- [steering.md](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/steering.md): 게임데이 운영 전략 문서
- [decision-log.md](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/decision-log.md): 의사결정 및 작업 기록
- [postmortem-draft.md](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/postmortem-draft.md): 사후 분석 초안

## 전제 조건

- Node.js 및 `npm`
- AWS CDK CLI v2
- AWS 자격 증명
- Docker
- `k6`

기본 대상 환경:

- AWS Account: `807876133169`
- AWS Region: `ap-northeast-2`

## CDK 스택

`cdk-infra` 앱은 아래 스택을 정의한다.

- `UnicornRentalInfraStack`: 기존 ALB/ASG/DynamoDB를 lookup해서 알람, SNS, Lambda 출력값을 관리
- `UnicornRentalEcsNetworkStack`: ECS 용도 private subnet 2개와 NAT Gateway 추가
- `UnicornRentalEcsStack`: ECS Cluster, Fargate Service, ECS Target Group, weighted forwarding rule 구성

`cdk-dashboard` 앱은 아래 스택을 정의한다.

- `UnicornRentalDashboardStack`: ALB, ECS, DynamoDB 지표와 ECS 알람을 포함한 CloudWatch Dashboard 생성

## 자주 쓰는 명령

### 1. CDK 의존성 설치

```bash
cd cdk-infra
npm install

cd ../cdk-dashboard
npm install
```

### 2. 인프라 스택 확인 및 배포

```bash
cd cdk-infra
npx cdk list
npx cdk synth
npx cdk deploy UnicornRentalInfraStack UnicornRentalEcsNetworkStack UnicornRentalEcsStack
```

### 3. 대시보드 스택 확인 및 배포

```bash
cd cdk-dashboard
npx cdk list
npx cdk synth
npx cdk deploy UnicornRentalDashboardStack
```

### 4. Docker 이미지 빌드

```bash
docker build -t unicorn-rental -f docker/Dockerfile docker
```

필요하면 ECR에 푸시한 뒤 `cdk-infra/lib/ecs-stack.ts`의 `ECR_IMAGE`와 맞춰 배포한다.

### 5. Smoke 테스트

```bash
k6 run smoke-test.js
```

### 6. 부하 테스트

```bash
k6 run -e SCENARIO=smoke k6/load-test.js
k6 run -e SCENARIO=load k6/load-test.js
k6 run -e SCENARIO=spike k6/load-test.js
```

다른 엔드포인트를 검증하려면 `BASE_URL` 환경변수로 덮어쓸 수 있다.

```bash
k6 run -e BASE_URL=http://example.com -e SCENARIO=smoke k6/load-test.js
```

## 주의 사항

- 여러 리소스 식별자가 하드코딩되어 있어 다른 계정이나 리전으로 복제하기 전에 값 정리가 필요하다.
- `cdk-infra`는 일부 기존 리소스를 `fromLookup` 또는 ARN 기반 참조로 가져온다. 따라서 이 저장소만으로 전체 인프라를 처음부터 생성하는 구조는 아니다.
- ECS 전환 과정에서 ALB weighted forwarding 규칙을 사용한다. 현재 코드상 기본 의도는 EC2와 ECS를 함께 연결해 점진적으로 트래픽을 이동하는 것이다.
- 테스트 스크립트의 기본 URL은 실제 ALB DNS를 가리킨다. 외부 공유 환경에서 실행할 때는 대상 URL을 다시 확인해야 한다.

## 참고 문서

- [architecture.md](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/architecture.md)
- [decision-log.md](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/decision-log.md)
- [postmortem-draft.md](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/postmortem-draft.md)
- [steering.md](/Users/joonjeong/workspace/2026-aws-gameday/solution/trial2/steering.md)
