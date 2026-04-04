# Unicorn Rental Initial Deploy Manual

이 문서는 `bootstrap/unicorn-rental-init` 스택을 처음 배포하는 절차를 정리한다.

목표:

- GameDay 시작용 기준 인프라를 생성한다.
- public subnet 기반 EC2 + ALB + ASG + DynamoDB 상태를 만든다.
- IAM operator user / access key / SSH key 관련 output을 확보한다.
- 이후 `solution/` 에서 private subnet 중심 구조로 전환할 출발점을 만든다.

중요한 전제:

- 이 초기 배포는 의도적으로 거칠다.
- "일단 돌아가는 환경"을 우선하며, production-ready 상태를 목표로 하지 않는다.
- public subnet EC2, 직접 SSH, 단순 실행 구조, 느슨한 운영 방식은 bootstrap realism을 위한 선택이다.
- Well-Architected 관점의 부족함을 남겨두는 것이 오히려 목적에 부합한다.

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

최소한 아래 값은 정하고 시작한다.

- `ProjectName`
- `OperatorUserName`
- `InstanceType`
- `DesiredCapacity`
- `MinCapacity`
- `MaxCapacity`
- `HealthCheckPath`

예시:

- `ProjectName=unicorn-rental`
- `OperatorUserName=unicorn-rental-operator`
- `InstanceType=t3.small`
- `DesiredCapacity=2`
- `MinCapacity=2`
- `MaxCapacity=4`
- `HealthCheckPath=/actuator/health`

## 3. 첫 배포

`bootstrap/unicorn-rental-init` 디렉터리에서 실행한다.

```bash
npx cdk deploy UnicornRentalBootstrapStack \
  --require-approval never \
  --parameters ProjectName=unicorn-rental \
  --parameters OperatorUserName=unicorn-rental-operator \
  --parameters InstanceType=t3.small \
  --parameters DesiredCapacity=2 \
  --parameters MinCapacity=2 \
  --parameters MaxCapacity=4 \
  --parameters HealthCheckPath=/actuator/health
```

CDK CLI가 전역 설치돼 있으면 아래도 가능하다.

```bash
cdk deploy UnicornRentalBootstrapStack --require-approval never
```

## 4. 배포 직후 확보할 Output

CloudFormation stack output에서 아래를 바로 기록한다.

- `VpcId`
- `PublicSubnetIds`
- `PrivateSubnetIds`
- `LoadBalancerDnsName`
- `TargetGroupArn`
- `AutoScalingGroupName`
- `DynamoTableName`
- `Ec2KeyPairName`
- `Ec2PrivateKeyParameterName`
- `Ec2PrivateKeyMaterial`
- `CloudFormationExecutionRoleArn`
- `OperatorUserNameOutput`
- `OperatorAccessKeyId`
- `OperatorSecretAccessKey`

주의:

- `Ec2PrivateKeyMaterial` 과 `OperatorSecretAccessKey` 는 민감 정보다.
- GameDay 용도라 하더라도 배포 직후 저장 위치를 명확히 정해두는 편이 낫다.

## 5. 배포 확인

### CloudFormation / 인프라 확인

```bash
aws cloudformation describe-stacks --stack-name UnicornRentalBootstrapStack
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names unicorn-rental-asg
aws elbv2 describe-load-balancers --names unicorn-rental-alb
aws dynamodb describe-table --table-name unicorn-rental-orders
```

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

## 6. SSH 접속 확인

이 단계가 가능한 이유 자체가 bootstrap 환경이 아직 거칠기 때문이다. 이후 `solution/` 단계에서는 이런 직접 접근 가능성을 줄이는 방향이 목표다.

`Ec2PrivateKeyMaterial` output을 PEM 파일로 저장한 뒤 권한을 조정한다.

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

## 7. Operator User 전환 준비

bootstrap stack이 성공적으로 올라가면, output의 아래 값으로 제한된 운영 사용자 컨텍스트를 구성할 수 있다.

- `OperatorAccessKeyId`
- `OperatorSecretAccessKey`
- `CloudFormationExecutionRoleArn`

이 사용자는 직접 광범위한 생성 권한을 갖지 않고, 지정된 CloudFormation 실행 role을 통해서만 작업하도록 설계돼 있다.

## 8. Drift 실험 시작점

권장 실험 순서:

1. EC2에 직접 SSH 접속해서 파일 수정
2. security group rule 수동 변경
3. ASG desired capacity 수동 변경
4. DynamoDB item 직접 수정
5. `DetectStackDrift` 실행
6. 이후 `solution/` 기반 변경으로 private subnet 구조로 전환

drift 확인 예시:

```bash
aws cloudformation detect-stack-drift --stack-name UnicornRentalBootstrapStack
aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id <id>
```
