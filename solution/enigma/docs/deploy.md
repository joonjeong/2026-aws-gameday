# Enigma Deploy

이 문서는 `solution/enigma` 를 실제 GameDay 작업에 투입할 때 사용하는 배포 및 운영 확인 절차를 정리한다.

## 1. 전제 조건

- AWS CLI 설정 완료
- CDK CLI v2 설치
- Docker 실행 가능
- `solution/enigma` 디렉터리에서 작업

권장 확인:

```bash
aws sts get-caller-identity
npm install
npm test
```

## 2. 대상 URL 설정

테스트 대상 환경의 ALB DNS 이름을 확인한 뒤 [cdk.json](../cdk.json) 의 `targetBaseUrl` 에 넣는다. 일반적으로 `unicorn-rental-init` application stack 의 `LoadBalancerDnsName` output 값을 사용한다.

예:

```json
{
  "context": {
    "targetBaseUrl": "http://my-unicorn-rental-alb-123456789.ap-northeast-2.elb.amazonaws.com"
  }
}
```

## 3. 합성 및 배포

```bash
npm run synth
npx cdk deploy EnigmaTrafficStack --require-approval never
```

확인할 output:

- `TargetBaseUrl`
- `TrafficVpcId`
- `TrafficPublicSubnetIds`
- `TrafficTaskSecurityGroupId`
- `TrafficClusterName`
- `BaselineTaskDefinitionArn`
- `AnomalyTaskDefinitionArn`
- `ScheduleGroupName`
- `BaselineScheduleName`
- `AnomalyScheduleName`
- `BaselineLogGroupName`
- `AnomalyLogGroupName`

## 4. 스케줄 확인

```bash
aws scheduler get-schedule --group-name <ScheduleGroupName> --name <BaselineScheduleName>
aws scheduler get-schedule --group-name <ScheduleGroupName> --name <AnomalyScheduleName>
```

## 5. 로그 확인

```bash
aws logs tail <BaselineLogGroupName> --follow
aws logs tail <AnomalyLogGroupName> --follow
```

## 6. 수동 실행

이상 트래픽을 즉시 보고 싶다면 Scheduler 를 기다리지 말고 task definition 을 직접 실행하면 된다.

```bash
aws ecs run-task \
  --cluster <TrafficClusterName> \
  --launch-type FARGATE \
  --task-definition <AnomalyTaskDefinitionArn> \
  --network-configuration "awsvpcConfiguration={subnets=[<TrafficPublicSubnetIds comma split>],securityGroups=[<TrafficTaskSecurityGroupId>],assignPublicIp=ENABLED}"
```

`TrafficPublicSubnetIds` 는 쉼표 문자열이라 CLI 인자에 맞게 각 subnet id 로 분리해서 넣는다.
