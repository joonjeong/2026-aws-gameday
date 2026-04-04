# Unicorn Rental Init Bootstrap

`bootstrap/unicorn-rental-init` 는 Unicorn Rental bootstrap 환경의 현재 기준 인프라를 생성하는 AWS CDK 앱이다.

이 문서는 현재 버전만 다룬다.

## 현재 구조

- `UnicornRentalNetworkStack`: dedicated VPC, public subnet only
- `UnicornRentalApplicationStack`: ALB, target group, Auto Scaling Group, LaunchTemplate, EC2, DynamoDB, instance role, EC2 key pair
- ALB는 `80` 포트로 들어오고 앱 인스턴스는 `8080` 포트로 응답한다
- 앱 인스턴스는 public subnet에서 동적 public IP를 받고 SSH `22` 포트가 열려 있다
- NAT Gateway와 Elastic IP는 없다
- SSH private key material은 CloudFormation output이 아니라 SSM Parameter Store에 저장된다
- 각 인스턴스는 부팅 시 CDK assets S3 bucket에서 앱 소스, 환경파일, `systemd` 유닛, bootstrap script를 내려받고, `awscli` 와 Java를 설치한 뒤 컴파일과 서비스 기동을 수행한다

## 아키텍처

```text
                                 Internet
                                     |
                                 HTTP :80
                                     v
                      +-------------------------------+
                      | Application Load Balancer     |
                      +---------------+---------------+
                                      |
                                  HTTP :8080
                                      v
      +-------------------------------------------------------------------+
      | Dedicated VPC                                                      |
      | public subnets only, no NAT Gateway, no Elastic IP                 |
      |                                                                   |
      |  +---------------------------+                                    |
      |  | Auto Scaling Group        |                                    |
      |  | LaunchTemplate-backed EC2 |                                    |
      |  +-------------+-------------+                                    |
      |                |                                                  |
      |        +-------+--------+                                         |
      |        |                |                                         |
      |    +---v----+      +----v---+      +---------------------------+  |
      |    | EC2 #1 |      | EC2 #2 |----->| DynamoDB                  |  |
      |    | app    |      | app    |      | unicorn-rental-orders     |  |
      |    +---+----+      +----+---+      +---------------------------+  |
      |        ^                ^                                         |
      |        | SSH :22        |                                         |
      +--------+----------------+-----------------------------------------+
               |                |
               |                +-----------------------------------+
               |                                                    |
      +--------v---------+                               +-----------v-----------+
      | SSM Parameter    |                               | CDK assets S3 bucket  |
      | Store            |                               | - UnicornRentalApp    |
      | - EC2 private key|                               | - service.env         |
      +------------------+                               | - service.service     |
                                                         | - bootstrap.sh        |
                                                         +-----------+-----------+
                                                                          |
                                                                      aws s3 cp
                                                                          v
                                                           /opt/<projectName>/app
                                                           systemd: <projectName>
```

## 스택 요약

- `UnicornRentalNetworkStack`: dedicated VPC, public subnets
- `UnicornRentalApplicationStack`: security groups, EC2 instance role, EC2 key pair, LaunchTemplate, Auto Scaling Group, Application Load Balancer, target group, DynamoDB table

## 기본 명령

```bash
npm install
npm run build
npm test
npm run synth
```

## 설정

설정값은 [cdk.json](/Users/joonjeong/workspace/2026-aws-gameday/bootstrap/unicorn-rental-init/cdk.json) 의 `context` 에 둔다.

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/unicorn-rental-init.ts",
  "context": {
    "resourcePrefix": "",
    "projectName": "unicorn-rental",
    "instanceType": "t3.small",
    "desiredCapacity": 2,
    "minCapacity": 2,
    "maxCapacity": 4,
    "healthCheckPath": "/actuator/health"
  }
}
```

- `resourcePrefix`: 선택값. 비워두면 기본 이름을 쓴다
- `projectName`: 리소스 이름, 앱 디렉터리, `systemd` 서비스 이름의 기준값이다
- `healthCheckPath`: ALB target group health check 경로다

배포, 출력값 확인, SSH 접속 절차는 [initial-deploy.md](/Users/joonjeong/workspace/2026-aws-gameday/bootstrap/unicorn-rental-init/docs/initial-deploy.md) 에 정리했다.
