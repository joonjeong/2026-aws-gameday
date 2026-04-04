# Unicorn Rental Initial Deploy Manual

이 문서는 `bootstrap/unicorn-rental-init` 스택을 처음 배포하는 절차를 정리한다.

목표:

- GameDay 시작용 기준 인프라를 생성한다.
- public subnet 기반 EC2 + ALB + ASG + DynamoDB 상태를 필요 시 나중에 만든다.
- 우선은 네트워크 기반만 먼저 올린다.
- bootstrap 네트워크는 NAT Gateway와 EIP 없이 유지한다.
- bootstrap 단계에서는 app subnet을 만들지 않고, 이후 `solution/` 에서 private subnet 구조를 추가한다.

중요한 전제:

- 이 초기 배포는 의도적으로 거칠다.
- "일단 돌아가는 환경"을 우선하며, production-ready 상태를 목표로 하지 않는다.
- public subnet EC2, 직접 SSH, 단순 실행 구조, 느슨한 운영 방식은 bootstrap realism을 위한 선택이다.
- Well-Architected 관점의 부족함을 남겨두는 것이 오히려 목적에 부합한다.

## 아키텍처 개요

```text
                                Internet
                                    |
        +---------------------------------------------------------------+
        | CDK App: bootstrap/unicorn-rental-init                        |
        |                                                               |
        |  +---------------------------------------------------------+  |
        |  | Stack 1: UnicornRentalNetworkStack                      |  |
        |  |                                                         |  |
        |  |  Dedicated GameDay VPC                                  |  |
        |  |  - Public subnets only                                  |  |
        |  +---------------------------+-----------------------------+  |
        |                              |                                |
        |                              v                                |
        |  +---------------------------------------------------------+  |
        |  | Stack 2: UnicornRentalApplicationStack                  |  |
        |  | deployed later only when needed                         |  |
        |  |                                                         |  |
        |  |  - ALB security group                                   |  |
        |  |  - App security group                                   |  |
        |  |  +-------------------+                                  |  |
        |  |  | Public ALB        | <--------- HTTP:80 ------------- |  |
        |  |  +---------+---------+                                  |  |
        |  |            | HTTP:8080                                  |  |
        |  |            v                                            |  |
        |  |  +-------------------+                                  |  |
        |  |  | Target Group      |                                  |  |
        |  |  +---------+---------+                                  |  |
        |  |            |                                            |  |
        |  |            v                                            |  |
        |  |  +-------------------+                                  |  |
        |  |  | Auto Scaling Group|                                  |  |
        |  |  | unicorn-rental-asg|                                  |  |
        |  |  +---------+---------+                                  |  |
        |  |            |                                            |  |
        |  |     +------+------+                                     |  |
        |  |     |             |                                     |  |
        |  |     v             v                                     |  |
        |  |  +--------+   +--------+                                |  |
        |  |  | EC2 #1 |   | EC2 #2 | <----- SSH:22 ---------------  |  |
        |  |  | Java   |   | Java   |                                |  |
        |  |  | DDB CLI|   | DDB CLI|                                |  |
        |  |  +--------+   +--------+                                |  |
        |  |                                                         |  |
        |  |  +----------------------+                               |  |
        |  |  | DynamoDB Table       |                               |  |
        |  |  | unicorn-rental-orders|                               |  |
        |  |  | - rentals            |                               |  |
        |  |  | - orders             |                               |  |
        |  |  +----------------------+                               |  |
        |  +---------------------------------------------------------+  |
        +---------------------------------------------------------------+
```

## 1. 전제 조건

- AWS 계정에 bootstrap 스택을 생성할 수 있는 상위 권한이 있어야 한다.
- AWS CLI가 설정되어 있어야 한다.
- CDK CLI v2가 있어야 한다.
- 현재 프로젝트 기준 `aws-cdk-lib` 버전은 `2.243.0` 이다.

권장 확인:

```bash
aws sts get-caller-identity
cd bootstrap/unicorn-rental-init
npm install
npm run build
npm run synth
```

## 2. 배포 전 결정값

최소한 아래 context 값은 정하고 시작한다.

- `ResourcePrefix` (optional)
- `ProjectName`
- `InstanceType`
- `DesiredCapacity`
- `MinCapacity`
- `MaxCapacity`
- `HealthCheckPath`

예시:

- `ResourcePrefix=gameday-a`
- `ProjectName=unicorn-rental`
- `InstanceType=t3.small`
- `DesiredCapacity=2`
- `MinCapacity=2`
- `MaxCapacity=4`
- `HealthCheckPath=/actuator/health`

## 3. 설정 방식

이 앱은 CloudFormation parameter 대신 CDK app context를 사용한다.

반복 배포할 값은 `cdk.json` 의 `context` 에 넣어 파일로 관리할 수 있다.

예시:

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

주의:

- `resourcePrefix` 는 선택값이다. 비워두면 기존 이름을 유지한다.
- `resourcePrefix` 를 `gameday-a` 로 넣으면 `gameday-a-unicorn-rental-alb`, `gameday-a-unicorn-rental-orders`, `gameday-a-UnicornRentalNetworkStack` 같은 이름이 된다.
- key 이름은 `ProjectName` 이 아니라 `projectName` 처럼 코드에서 읽는 lower camel case를 그대로 사용해야 한다.
- `resourcePrefix` 는 소문자, 숫자, 하이픈만 사용할 수 있고, 앞뒤에 하이픈을 둘 수 없다.
- `resourcePrefix` 는 너무 길면 ALB, target group, IAM role/user 이름 제한에 걸릴 수 있으니 짧게 유지하는 편이 안전하다.
- 숫자 값은 JSON 숫자로 넣어도 되고, CLI `-c` 에서는 문자열로 넣어도 된다.

이렇게 설정하면 배포 명령에서 긴 `-c` 목록을 매번 반복하지 않아도 된다.

```bash
npx cdk deploy UnicornRentalNetworkStack \
  --exclusively \
  --require-approval never
```

일회성으로 값만 바꾸고 싶으면 CLI `-c` 로 override 할 수 있다.

예시:

```bash
npx cdk deploy UnicornRentalNetworkStack \
  --exclusively \
  --require-approval never \
  -c resourcePrefix=gameday-a
```

예시:

```bash
-c projectName=unicorn-rental \
-c instanceType=t3.small \
-c desiredCapacity=2 \
-c minCapacity=2 \
-c maxCapacity=4 \
-c healthCheckPath=/actuator/health
```

CLI `-c` 값이 `cdk.json` 의 같은 key보다 우선한다.

## 4. 첫 배포: Network

`Application` 스택은 아직 배포하지 않는다.

`bootstrap/unicorn-rental-init` 디렉터리에서 실행한다.

`cdk.json` 에 `context` 를 넣었다면 아래처럼 실행한다.

```bash
npx cdk deploy UnicornRentalNetworkStack \
  --exclusively \
  --require-approval never
```

파일 대신 CLI로 직접 넘기려면 3장의 `-c` 예시를 그대로 뒤에 붙이면 된다.

CDK CLI가 전역 설치돼 있으면 아래도 가능하다.

```bash
cdk deploy UnicornRentalNetworkStack --exclusively --require-approval never
```

실제 CloudFormation stack name은 `resourcePrefix` 가 설정되면 `<prefix>-UnicornRentalNetworkStack`, `<prefix>-UnicornRentalApplicationStack` 형태로 생성된다. 다만 CDK CLI에서 지정하는 스택 식별자는 그대로 `UnicornRentalNetworkStack`, `UnicornRentalApplicationStack` 를 사용하면 된다.

## 5. 첫 배포 직후 확보할 Output

우선 아래 output만 기록한다.

- `VpcId`
- `PublicSubnetIds`

## 6. 첫 배포 확인

### CloudFormation / 인프라 확인

```bash
aws cloudformation describe-stacks --stack-name UnicornRentalNetworkStack
```

`resourcePrefix` 를 설정했다면 여기의 `--stack-name` 에도 실제 생성된 이름인 `<prefix>-UnicornRentalNetworkStack` 를 사용해야 한다.

## 7. Application 스택 배포

실제 실습 시점에만 아래를 실행한다.

```bash
npx cdk deploy UnicornRentalApplicationStack \
  --require-approval never
```

`cdk.json` 을 쓰지 않는 경우에는 여기에도 3장의 `-c` context 값을 같은 방식으로 붙인다.

배포 후 확보할 output:

- `LoadBalancerDnsName`
- `TargetGroupArn`
- `AutoScalingGroupName`
- `DynamoTableName`
- `InstanceRoleArn`
- `Ec2KeyPairName`
- `Ec2PrivateKeyParameterName`

## 8. Application 배포 후 확인

### CloudFormation / 인프라 확인

```bash
aws cloudformation describe-stacks --stack-name UnicornRentalApplicationStack
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names unicorn-rental-asg
aws elbv2 describe-load-balancers --names unicorn-rental-alb
aws dynamodb describe-table --table-name unicorn-rental-orders
```

`resourcePrefix` 를 설정했다면 위 리소스 이름도 같은 방식으로 prefix가 붙은 실제 이름을 사용해야 한다.

## 9. 기존 Access 스택 제거

이제 CDK 앱에는 `UnicornRentalAccessStack` 이 없다. 기존 환경에 이 스택이 이미 배포돼 있었다면 코드 제거 후에도 자동으로 사라지지 않으므로 별도로 정리해야 한다.

영향:

- operator IAM user, access key, CloudFormation execution role output이 더 이상 생성되지 않는다.
- 이후 bootstrap 배포 단위는 `UnicornRentalNetworkStack`, `UnicornRentalApplicationStack` 두 개만 남는다.

기존 Access 스택 정리:

```bash
npx cdk destroy UnicornRentalAccessStack --force
```

`resourcePrefix` 를 사용했다면 실제 CloudFormation stack name은 `<prefix>-UnicornRentalAccessStack` 이다.

### ALB 응답 확인

```bash
curl http://<LoadBalancerDnsName>/
curl http://<LoadBalancerDnsName>/actuator/health
curl "http://<LoadBalancerDnsName>/api/rentals"
curl "http://<LoadBalancerDnsName>/api/orders"
```

### DynamoDB 유스케이스 확인

주문 생성:

```bash
curl "http://<LoadBalancerDnsName>/api/orders/create?rentalId=demo-1&customer=alice&days=3"
```

주문 조회:

```bash
curl "http://<LoadBalancerDnsName>/api/orders"
```

주문 취소:

```bash
curl "http://<LoadBalancerDnsName>/api/orders/cancel?id=<order-id>"
```

정비 완료:

```bash
curl "http://<LoadBalancerDnsName>/api/rentals/maintenance/complete?id=demo-3"
```

## 10. SSH 접속 확인

이 단계가 가능한 이유 자체가 bootstrap 환경이 아직 거칠기 때문이다. 이후 `solution/` 단계에서는 이런 직접 접근 가능성을 줄이는 방향이 목표다.

먼저 `Ec2PrivateKeyParameterName` output으로 SSM parameter 이름을 확인한 뒤, private key를 복호화해서 PEM 파일로 저장한다.

```bash
aws ssm get-parameter \
  --with-decryption \
  --name <Ec2PrivateKeyParameterName> \
  --query 'Parameter.Value' \
  --output text > unicorn-rental-bootstrap.pem
```

```bash
chmod 400 unicorn-rental-bootstrap.pem
```

인스턴스 public IP 확인:

```bash
aws ec2 describe-instances \
  --filters "Name=tag:aws:autoscaling:groupName,Values=unicorn-rental-asg" \
  --query "Reservations[].Instances[].PublicIpAddress" \
  --output text
```

접속:

```bash
ssh -i unicorn-rental-bootstrap.pem ec2-user@<public-ip>
```

접속 후 확인:

```bash
systemctl status unicorn-rental
journalctl -u unicorn-rental -n 100 --no-pager
curl http://127.0.0.1:8080/actuator/health
```

## 11. Drift 실험 시작점

권장 실험 순서:

1. EC2에 직접 SSH 접속해서 파일 수정
2. security group rule 수동 변경
3. ASG desired capacity 수동 변경
4. DynamoDB item 직접 수정
5. `DetectStackDrift` 실행
6. 이후 `solution/` 기반 변경으로 private subnet 구조로 전환

drift 확인 예시:

```bash
aws cloudformation detect-stack-drift --stack-name UnicornRentalNetworkStack
aws cloudformation detect-stack-drift --stack-name UnicornRentalApplicationStack
aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id <id>
```
