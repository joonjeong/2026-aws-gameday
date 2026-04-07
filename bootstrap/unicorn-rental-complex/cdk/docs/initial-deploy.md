# Initial Deploy

## 1. Build the Spring Boot artifact

```bash
cd ../app
./gradlew test bootJar
```

필수 산출물:

- `app/build/libs/unicorn-rental-complex-app.jar`

## 2. Install CDK dependencies

```bash
cd ../cdk
npm install
```

## 3. Validate the CDK app

```bash
npm test
npm run synth
```

## 4. Deploy

```bash
cdk deploy
```

배포 중 CDK는 다음을 함께 올린다.

- `app/` 소스 사본을 S3 `source/app/` prefix 로 업로드
- `unicorn-rental-complex-app.jar` 를 S3 `artifacts/` prefix 로 업로드

이후 LaunchTemplate 로 생성되는 EC2는 부팅 시 S3에서 jar 를 내려받고, Secrets Manager 에서 Postgres 비밀번호를 읽어 Spring Boot 서비스를 시작한다.

## 5. Access Postgres from local machine

RDS 는 private isolated subnet 에 있으므로 직접 접속하지 않는다.
앱 EC2 인스턴스를 경유한 SSM port forwarding 을 사용한다.

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

터널:

```bash
aws ssm start-session \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$DB_HOST,portNumber=5432,localPortNumber=15432"
```

다른 터미널에서 접속:

```bash
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --query SecretString \
  --output text)

DB_USER=$(printf '%s' "$SECRET_JSON" | jq -r '.username')
DB_PASS=$(printf '%s' "$SECRET_JSON" | jq -r '.password')

PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -p 15432 -U "$DB_USER" -d unicorn_rental
```

## 6. SSH to an app instance

앱 EC2 는 public subnet 에 배치되고 public IP 를 받으며, SSH `22/tcp` 가 열려 있다.
private key material 은 SSM Parameter Store 에 저장되므로 output 에서 parameter name 을 읽어 내려받는다.

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

private key 저장:

```bash
aws ssm get-parameter \
  --name "$KEY_PARAM" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text > unicorn-rental-complex.pem

chmod 600 unicorn-rental-complex.pem
```

접속:

```bash
ssh -i unicorn-rental-complex.pem ec2-user@"$PUBLIC_IP"
```
