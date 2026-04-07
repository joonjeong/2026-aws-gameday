# Unicorn Rental Complex Bootstrap

`bootstrap/unicorn-rental-complex` 는 `unicorn-rental-simple` 을 확장한 GameDay용 예제다.

핵심 차이:

- `app/`: Spring Boot + Gradle 기반 Java 애플리케이션
- `cdk/`: AWS CDK 인프라 코드
- DynamoDB: 사용자 세션 저장소
- Postgres(RDS): 비즈니스 데이터 저장소
- S3: 애플리케이션 소스 사본과 bootJar 아티팩트 저장소
- EC2 LaunchTemplate user-data: 부팅 시 S3에서 bootJar 다운로드 후 실행
- VPC: public subnet(app, ALB), private isolated subnet(Postgres)

## 구조

```text
unicorn-rental-complex/
├── app/    # Spring Boot application source
└── cdk/    # AWS CDK infrastructure
```

## 아키텍처

```text
                                     Internet
                                         |
                                      HTTP :80
                                         |
                          +--------------v--------------+
                          | Public Application Load     |
                          | Balancer                    |
                          +--------------+--------------+
                                         |
                                      HTTP :8080
                                         |
      +------------------------------------------------------------------------+
      | Dedicated VPC                                                           |
      |                                                                        |
      |  +--------------------------------+    +-----------------------------+  |
      |  | Public Subnet A/B              |    | Private Isolated Subnet A/B |  |
      |  |                                |    |                             |  |
      |  |  +--------------------------+  |    |  +-----------------------+  |  |
      |  |  | Auto Scaling Group       |  |    |  | RDS for PostgreSQL    |  |  |
      |  |  | LaunchTemplate-backed    |  |    |  | business data backend |  |  |
      |  |  | EC2 instances            |  |    |  +-----------^-----------+  |  |
      |  |  +------------+-------------+  |    |              | 5432          |  |
      |  |               |                |    +--------------+----------------+  |
      |  |               | boot on start  |                                   |
      |  |               v                |                                   |
      |  |     /opt/unicorn-rental-...    |                                   |
      |  |     Spring Boot app :8080      |-----------------------------------+
      |  |                                |        JDBC to Postgres
      |  +--------------------------------+
      +-------------------------+----------------------------------------------+
                                |
                                | AWS API calls from EC2 instance role
                                |
        +-----------------------+------------------------+----------------------+
        |                                                |                      |
  +-----v--------------------------------+   +-----------v-----------+  +------v-------+
  | S3 deployment bucket                 |   | DynamoDB session      |  | Secrets       |
  | - source/app/*                       |   | table                 |  | Manager       |
  | - artifacts/unicorn-rental-...jar    |   | - user sessions       |  | - DB password |
  +------------------+-------------------+   +-----------------------+  +--------------+
                     |
                     +--> LaunchTemplate user-data downloads bootJar before service start
```

S3 배포 버킷에는 다음이 올라간다.

- `source/app/*`: `app/` 디렉터리의 소스 사본
- `artifacts/unicorn-rental-complex-app.jar`: `bootJar` 산출물

## 앱 빌드

```bash
cd app
./gradlew test bootJar
```

`cdk` 는 `app/build/libs/unicorn-rental-complex-app.jar` 가 존재해야 synth/deploy 된다.

## 인프라 검증

```bash
cd cdk
npm install
npm test
npm run synth
```

## 주요 컨텍스트 값

`cdk/cdk.json` 의 기본값:

- `projectName`: `unicorn-rental-complex`
- `instanceType`: app EC2 타입
- `databaseInstanceType`: Postgres RDS 타입
- `databaseName`: Postgres DB 이름
- `databaseUsername`: Postgres 사용자 이름
- `artifactFileName`: EC2가 S3에서 받는 bootJar 파일명
- `sessionTtlHours`: DynamoDB 세션 TTL
- `healthCheckPath`: ALB 헬스체크 경로

## 배포 흐름

1. `app/` 에서 `./gradlew test bootJar`
2. `cdk/` 에서 `npm install`
3. `cdk/` 에서 `npm test`
4. `cdk/` 에서 `npm run synth`
5. `cdk deploy`

배포가 끝나면:

- S3 버킷에 소스 사본과 jar 가 올라가 있고
- ASG 인스턴스는 LaunchTemplate user-data 로 jar 를 받아 실행하며
- 앱은 public subnet, Postgres 는 private subnet 에 위치한다

## 로컬에서 DB 접근

이 예제의 Postgres 는 private isolated subnet 에 있고 public access 가 꺼져 있다.
따라서 로컬 PC 에서 DB endpoint 로 직접 붙는 방식은 사용할 수 없다.

권장 방식은 public subnet 의 앱 EC2 인스턴스를 경유한 SSM 포트포워딩이다.

준비물:

- `aws` CLI
- `session-manager-plugin`
- `jq`
- `psql`

출력값과 실제 인스턴스 ID를 조회한다.

```bash
APP_STACK=UnicornRentalComplexApplicationStack

ASG_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$APP_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='AutoScalingGroupName'].OutputValue" \
  --output text)

DB_HOST=$(aws cloudformation describe-stacks \
  --stack-name "$APP_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='DatabaseEndpointAddress'].OutputValue" \
  --output text)

SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$APP_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='DatabaseSecretArn'].OutputValue" \
  --output text)

INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)
```

첫 번째 터미널에서 SSM 터널을 연다.

```bash
aws ssm start-session \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$DB_HOST,portNumber=5432,localPortNumber=15432"
```

두 번째 터미널에서 Secrets Manager 에서 비밀번호를 읽고 로컬 포트로 접속한다.

```bash
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --query SecretString \
  --output text)

DB_USER=$(printf '%s' "$SECRET_JSON" | jq -r '.username')
DB_PASS=$(printf '%s' "$SECRET_JSON" | jq -r '.password')

PGPASSWORD="$DB_PASS" psql \
  -h 127.0.0.1 \
  -p 15432 \
  -U "$DB_USER" \
  -d unicorn_rental
```

GUI 클라이언트를 쓰는 경우에도 동일하게 다음 값으로 접속하면 된다.

- Host: `127.0.0.1`
- Port: `15432`
- Username: Secrets Manager 의 `username`
- Password: Secrets Manager 의 `password`
- Database: `unicorn_rental`

## SSH 접근

현재 앱 EC2 인스턴스는 public subnet 에 있고 public IP 가 할당되며, SSH `22/tcp` 가 열려 있다.
생성된 EC2 key pair 의 private key material 은 CloudFormation output 이 아니라 SSM Parameter Store 에 저장된다.

준비물:

- `aws` CLI
- `ssh`

먼저 stack output 과 실제 인스턴스 public IP 를 조회한다.

```bash
APP_STACK=UnicornRentalComplexApplicationStack

ASG_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$APP_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='AutoScalingGroupName'].OutputValue" \
  --output text)

KEY_PARAM=$(aws cloudformation describe-stacks \
  --stack-name "$APP_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='Ec2PrivateKeyParameterName'].OutputValue" \
  --output text)

INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)

PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicIpAddress" \
  --output text)
```

SSM Parameter Store 에서 private key 를 내려받아 파일 권한을 맞춘다.

```bash
aws ssm get-parameter \
  --name "$KEY_PARAM" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text > unicorn-rental-complex.pem

chmod 600 unicorn-rental-complex.pem
```

이후 `ec2-user` 로 SSH 접속한다.

```bash
ssh -i unicorn-rental-complex.pem ec2-user@"$PUBLIC_IP"
```

참고:

- ASG 특성상 인스턴스가 교체되면 `INSTANCE_ID` 와 `PUBLIC_IP` 는 바뀔 수 있다
- 호스트 키 충돌이 나면 `ssh-keygen -R "$PUBLIC_IP"` 후 다시 접속하면 된다
- 직접 SSH 대신 `aws ssm start-session --target "$INSTANCE_ID"` 로 셸에 들어가는 방법도 가능하다
