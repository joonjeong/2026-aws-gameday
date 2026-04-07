# Unicorn Rental Initial Deploy

이 문서는 현재 `bootstrap/unicorn-rental-simple` 기준의 배포와 기본 검증 절차만 정리한다.

현재 구성:

- `UnicornRentalNetworkStack`: dedicated VPC, public subnets only
- `UnicornRentalApplicationStack`: ALB, target group, LaunchTemplate, ASG, EC2, DynamoDB, instance role, EC2 key pair
- NAT Gateway 없음
- Elastic IP 없음
- 각 인스턴스는 부팅 시 CDK assets S3 bucket에서 `UnicornRentalApp.java`, 환경파일, `systemd` 유닛, bootstrap script를 내려받고, bootstrap script가 `awscli` 와 Java를 설치한 뒤 컴파일과 서비스 기동 성공 여부까지 확인함
- EC2 SSH private key material은 SSM Parameter Store에 저장됨

## 1. 전제 조건

- AWS CLI 설정 완료
- CDK CLI v2 설치
- `bootstrap/unicorn-rental-simple` 디렉터리에서 작업

권장 확인:

```bash
aws sts get-caller-identity
npm install
npm test
npm run synth
```

## 2. 설정

배포 설정은 [cdk.json](/Users/joonjeong/workspace/2026-aws-gameday/bootstrap/unicorn-rental-simple/cdk.json) 의 `context` 로 관리한다.

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/unicorn-rental-simple.ts",
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

- `resourcePrefix`: 선택값이다. 비워두면 기본 이름을 쓰고, 넣으면 리소스와 CloudFormation stack name 앞에 prefix가 붙는다
- `projectName`: 리소스 이름, 앱 설치 경로 `/opt/<projectName>/app`, `systemd` 서비스 이름의 기준이 된다

CDK CLI에서 지정하는 스택 식별자는 항상 아래 둘이다.

- `UnicornRentalNetworkStack`
- `UnicornRentalApplicationStack`

CloudFormation 실제 stack name은 `resourcePrefix` 를 썼다면 각각 `<prefix>-UnicornRentalNetworkStack`, `<prefix>-UnicornRentalApplicationStack` 형태가 된다.

## 3. Network 배포

```bash
npx cdk deploy UnicornRentalNetworkStack \
  --exclusively \
  --require-approval never
```

확인할 output:

- `VpcId`
- `PublicSubnetIds`

## 4. Application 배포 및 현재 출력값

```bash
npx cdk deploy UnicornRentalApplicationStack \
  --exclusively \
  --require-approval never
```

확인할 output:

- `LoadBalancerDnsName`
- `TargetGroupArn`
- `AutoScalingGroupName`
- `DynamoTableName`
- `InstanceRoleArn`
- `Ec2KeyPairName`
- `Ec2PrivateKeyParameterName`

## 5. 기본 확인

```bash
aws cloudformation describe-stacks --stack-name <ApplicationStackName>
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names <AutoScalingGroupName>
curl http://<LoadBalancerDnsName>/actuator/health
curl http://<LoadBalancerDnsName>/
curl http://<LoadBalancerDnsName>/api/rentals
curl http://<LoadBalancerDnsName>/api/orders
```

`<ApplicationStackName>` 은 실제 CloudFormation stack name이다. `resourcePrefix` 를 사용하지 않았다면 `UnicornRentalApplicationStack` 이다.

## 6. SSH Key 조회

private key material은 CloudFormation output으로 나오지 않는다. `Ec2PrivateKeyParameterName` output 값을 사용해 SSM에서 복호화해서 가져온다.

```bash
aws ssm get-parameter \
  --with-decryption \
  --name <Ec2PrivateKeyParameterName> \
  --query 'Parameter.Value' \
  --output text > unicorn-rental-bootstrap.pem

chmod 400 unicorn-rental-bootstrap.pem
```

인스턴스 public IP 확인:

```bash
aws ec2 describe-instances \
  --filters "Name=tag:aws:autoscaling:groupName,Values=<AutoScalingGroupName>" \
  --query "Reservations[].Instances[?State.Name=='running'].PublicIpAddress" \
  --output text
```

SSH 접속:

```bash
ssh -i unicorn-rental-bootstrap.pem ec2-user@<public-ip>
```

## 7. 인스턴스 내부 확인

기본 `projectName` 이 `unicorn-rental` 이라면 앱 경로와 서비스 이름은 아래와 같다.

```bash
ls -l /opt/unicorn-rental/app
systemctl status unicorn-rental --no-pager
journalctl -u unicorn-rental -n 100 --no-pager
curl http://127.0.0.1:8080/actuator/health
```

`projectName` 을 변경했다면 경로 `/opt/<projectName>/app` 와 서비스 이름 `<projectName>` 으로 바꿔서 확인한다.

## 8. 현재 부팅 흐름 확인 포인트

문제가 생기면 아래 순서로 확인한다.

- `cloud-init` 또는 user data 로그에서 `aws s3 cp` 실행 여부 확인
- `/opt/<projectName>/app/UnicornRentalApp.java` 존재 여부 확인
- `/etc/<projectName>.env` 와 `/etc/systemd/system/<projectName>.service` 존재 여부 확인
- `aws --version` 확인
- `javac` 컴파일 성공 여부 확인
- `systemd` 서비스 `<projectName>` 상태 확인
- ALB health check 경로 `http://<LoadBalancerDnsName>/actuator/health` 응답 확인

현재 인스턴스 부팅 흐름은 아래와 같다.

```text
user data
  -> download UnicornRentalApp.java from CDK assets S3
  -> download <projectName>.env from CDK assets S3
  -> download <projectName>.service from CDK assets S3
  -> download bootstrap.sh from CDK assets S3
  -> install awscli + java
  -> compile UnicornRentalApp.java
  -> daemon-reload and enable --now <projectName>
  -> verify <projectName> is active
```

서비스 상태가 정상이면 ALB target group health check가 통과하고, `LoadBalancerDnsName` 으로 애플리케이션 엔드포인트를 호출할 수 있다.
