# Unicorn Rental Init Bootstrap

GameDay 시작 직전의 기준 인프라를 생성하는 CDK 앱이다.

## 배경 및 목적

- 실제 GameDay 상황과 유사하게 운영 환경의 거친 느낌을 재현한다.
- 잘 정리된 이상적 레퍼런스 아키텍처보다, 급하게 만들어져 "일단 돌아가는" 운영 환경에 가깝게 시작한다.
- 이후 `solution/` 에서 이 거친 초기 상태를 더 안전하고 운영 가능한 구조로 전환하는 과정을 실험한다.

## 운영 환경의 거친 느낌에서 오는 제약사항

- 일단 돌아가는 솔루션을 우선한 상태다.
- AWS Well-Architected Framework 와는 상당한 거리가 있는 상태다.
- 지속적인 유지보수성, 운영 취약점, 보안 강도는 충분히 고려되지 않은 상태다.
- public subnet 기반 EC2, 직접 SSH 접근, 단순한 실행 방식 등은 의도된 bootstrap 제약이다.
- 이 문서의 bootstrap 환경은 "좋은 최종 상태"가 아니라, 전환과 개선의 출발점이다.

## 비목표

- production-ready 아키텍처 제공
- 최소권한 보안 모델 완성
- 장기 운영에 적합한 네트워크 분리/비밀관리/배포 체계 완성
- 장애 격리, 비용 최적화, 운영 자동화가 충분히 반영된 상태 제공

즉, 이 bootstrap은 일부러 거칠고 불완전해야 한다. 그래야 GameDay 중 drift, 수동 변경, 긴급 대응, 구조 개선의 실용성을 체감할 수 있다.

## 목적

- 기존 운영 환경과 격리된 신규 VPC를 만든다.
- ALB + ASG + EC2 + DynamoDB 형태의 시작 상태를 재현한다.
- CloudFormation drift를 관찰할 수 있는 기준 스냅샷을 만든다.
- 별도 IAM user를 발급하되, 그 사용자는 지정된 CloudFormation 실행 role을 통해서만 배포를 수행하게 한다.

부트스트랩 단계 의도:

- 앱 EC2는 public subnet에 둔다.
- SSH key와 public 접근 경로를 열어 둔다.
- 이후 `solution/` 쪽 전환 작업에서 private subnet 기반 구조로 옮겨가게 한다.

## 아키텍처

```text
                                Internet
                                    |
        +-------------------------------------------------------------+
        | Dedicated GameDay VPC                                        |
        |                                                             |
        |  Public Subnets                                             |
        |                                                             |
        |  +-------------------+                                      |
        |  | Public ALB        | <------------- HTTP:80 ------------- |
        |  | unicorn-rental    |                                      |
        |  +---------+---------+                                      |
        |            | HTTP:8080                                      |
        |            v                                                |
        |  +-------------------+                                      |
        |  | Target Group      |                                      |
        |  +---------+---------+                                      |
        |            |                                                |
        |            v                                                |
        |  +-------------------+                                      |
        |  | Auto Scaling Group|                                      |
        |  | unicorn-rental-asg|                                      |
        |  +---------+---------+                                      |
        |            |                                                |
        |     +------+------+                                         |
        |     |             |                                         |
        |     v             v                                         |
        |  +--------+   +--------+                                    |
        |  | EC2 #1 |   | EC2 #2 | <--------- SSH:22 ---------------- |
        |  | Java   |   | Java   |                                    |
        |  | DDB CLI|   | DDB CLI|                                    |
        |  +--------+   +--------+                                    |
        |                                                             |
        |                                                             |
        |  Private Subnets                                            |
        |  - reserved for later migration target in solution/         |
        +-------------------------------------------------------------+
                                    |
                                    v
                         +----------------------+
                         | DynamoDB Table       |
                         | unicorn-rental-orders|
                         | - rentals            |
                         | - orders             |
                         +----------------------+

                     +-------------------------------+
                     | IAM operator user             |
                     | + access key outputs          |
                     | + passrole to CFN exec role   |
                     +---------------+---------------+
                                     |
                                     v
                     +-------------------------------+
                     | CloudFormation execution role |
                     | VPC/subnet scoped provisioning|
                     +-------------------------------+

Bootstrap intent:
- Start from public-subnet EC2 with direct SSH access
- Observe drift/manual changes in a more legacy-like topology
- Migrate toward private-subnet application placement via solution/
- Treat bootstrap as intentionally rough, not as a recommended final design
```

첫 배포 절차는 [initial-deploy.md](/Users/joonjeong/workspace/2026-aws-gameday/bootstrap/unicorn-rental-init/docs/initial-deploy.md) 에 정리했다.

## 권한 모델

### IAM user

- `cloudformation:*` 계열의 스택 작업
- 읽기 전용 조회 권한
- 지정된 `CloudFormationExecutionRole` 에 대한 `iam:PassRole`

직접 `ec2:RunInstances` 같은 생성 권한은 부여하지 않는다.

### CloudFormationExecutionRole

- 새로 만든 VPC와 그 하위 subnet 안에서만 EC2 / ALB / ASG 계열 리소스를 생성/수정하도록 제한
- DynamoDB, CloudWatch, Logs, SSM 등 운영 보조 서비스는 실행 가능

주의:

- AWS IAM 조건 키는 서비스마다 지원 범위가 다르다.
- 따라서 네트워크 경계가 있는 서비스는 VPC/subnet 조건으로 묶고, 그 외 서비스는 실행 role surface 자체를 좁히는 방식으로 제어했다.
- 이후 `solution/` 의 CDK 스택을 이 사용자로 바로 배포하려면, 생성되는 IAM role 정책이나 CDK bootstrap 전략은 추가 정리가 필요할 수 있다.

## 명령

```bash
npm install
npm run build
npm run synth
```

## User Data 분리

- EC2 초기화 shell 템플릿: `userdata/bootstrap.sh.tmpl`
- placeholder Java 소스: `userdata/UnicornRentalApp.java`

CDK 스택은 위 파일을 읽어 placeholder를 치환한 뒤 user data로 주입한다. 따라서 긴 shell/java 블록을 TypeScript 안에 하드코딩하지 않아도 된다.

현재 Java 앱은 다음 동작을 한다.

- `/actuator/health`: DynamoDB `DescribeTable` 기반 상태 확인
- `/api/rentals`: DynamoDB `Query` 기반 목록 조회
- `/api/rentals/reserve`: DynamoDB `UpdateItem` 기반 예약
- `/api/rentals/return`: DynamoDB `UpdateItem` 기반 반납
- `/api/orders`: DynamoDB `Query` 기반 주문 목록 조회
- `/api/orders/create`: 주문 생성 + 대여 자산 예약
- `/api/orders/cancel`: 주문 취소 + 대여 자산 반납
- `/api/rentals/maintenance/complete`: 정비 완료 후 자산 가용 상태 복구

의존성 없는 source-file 실행을 유지하기 위해 AWS SDK 대신 AL2023 기본 제공 AWS CLI v2를 Java 프로세스에서 호출한다.

## 코드 구조

- `lib/stacks/unicorn-rental-bootstrap-stack.ts`: 파라미터와 output을 조립하는 얇은 스택 엔트리
- `lib/bootstrap/network.ts`: VPC, subnet, security group
- `lib/bootstrap/application.ts`: DynamoDB, EC2 role, SSH key pair, user data, ASG, ALB, target group
- `lib/bootstrap/operator-access.ts`: operator IAM user, access key, CloudFormation execution role
- `lib/bootstrap/user-data.ts`: 외부 user data 자산 로드 및 템플릿 치환

주의:

- 파일은 나눴지만 리소스는 여전히 스택 루트 scope에 생성한다.
- 이렇게 해야 CDK logical ID가 바뀌지 않아 drift/전환 실험에 불필요한 리소스 교체가 생기지 않는다.
