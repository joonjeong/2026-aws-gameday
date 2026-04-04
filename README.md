# 2026 AWS GameDay Workspace

이 저장소는 두 개의 작업영역으로 나뉜다.

- `solution/`: 운영 도구, 모니터링, 런북, EC2 CI/CD, ECS 전환 초안
- `bootstrap/unicorn-rental-init/`: GameDay 시작 시점의 초기 인프라 스냅샷을 만드는 격리형 CDK 앱

## 구조

### `solution/`

기존에 준비한 GameDay 대응 자산이다.

- CloudWatch 대시보드/알람
- Q Developer / Kiro 프롬프트
- EC2 배포 자동화 IaC
- ECS 전환용 CDK 템플릿

### `bootstrap/unicorn-rental-init/`

초기 환경 스냅샷용 인프라다.

- 신규 전용 VPC
- ALB + ASG + EC2 기반 Java placeholder workload
- DynamoDB 테이블
- CloudFormation drift 관찰용 기준 리소스
- 신규 IAM user
- 신규 IAM user가 사용할 CloudFormation 실행 role

중요:

- 신규 IAM user는 직접 광범위한 리소스 생성 권한을 가지지 않는다.
- 대신 CloudFormation stack 작업과 지정된 실행 role 전달 권한만 가진다.
- 실제 생성 권한은 실행 role에 있으며, EC2 / ALB / ASG 계열 네트워크 리소스는 새로 만든 VPC와 그 하위 subnet 범위 안으로 제한했다.

