# Enigma Traffic Injector

`solution/enigma` 는 실제 GameDay 작업 중 `unicorn-rental-init` 계열 환경에 정기 트래픽과 간헐적 이상 트래픽을 주입하기 위해 사용한 AWS CDK 앱이다. `trial1/` 이 모의 훈련 결과를 보관하는 공간이라면, 이 디렉터리는 실제 대응에 사용한 실행 도구와 절차를 담는다.

기본 구조:

- dedicated VPC, public subnets only
- ECS Fargate cluster
- `grafana/k6` 기반 컨테이너 이미지
- EventBridge Scheduler baseline schedule
- EventBridge Scheduler anomaly schedule with flexible window jitter
- CloudWatch Logs for baseline and anomaly runs

## 아키텍처

```text
                           EventBridge Scheduler
                      +------------+-------------+
                      |                          |
              rate(5 minutes)           cron + flexible window
                      |                          |
                      v                          v
               ECS RunTask                 ECS RunTask
                      |                          |
                      +------------+-------------+
                                   v
                       +------------------------+
                       | ECS Fargate Cluster    |
                       | enigma k6 runners      |
                       +-----------+------------+
                                   |
                             HTTP/HTTPS
                                   v
                  unicorn-rental-init Application Load Balancer
```

## 현재 구성

- `EnigmaTrafficStack`: VPC, ECS cluster, task security group, k6 image asset, baseline/anomaly task definitions, EventBridge Scheduler, CloudWatch Logs
- baseline task는 `scripts/baseline.js` 를 실행해 `/`, `/actuator/health`, `/api/rentals`, `/api/orders` 와 상태 전이 API를 완만하게 호출한다
- anomaly task는 `scripts/anomaly.js` 를 실행해 잘못된 메서드, 누락된 파라미터, 없는 주문 ID, 상태 경합을 섞어 비정상 패턴을 만든다
- anomaly schedule은 flexible window를 사용해 매번 정확히 같은 시각에 실행되지 않도록 jitter를 준다
- 모든 Fargate task는 public subnet + public IP로 외부 ALB DNS를 호출한다

## 기본 명령

```bash
npm install
npm run build
npm test
npm run synth
```

## 설정

설정값은 [cdk.json](cdk.json) 의 `context` 에 둔다.

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/enigma.ts",
  "context": {
    "resourcePrefix": "",
    "projectName": "enigma",
    "targetBaseUrl": "http://<LoadBalancerDnsName>",
    "targetTimeoutMs": 3000,
    "baselineEnabled": true,
    "anomalyEnabled": true,
    "baselineScheduleExpression": "rate(5 minutes)",
    "anomalyScheduleExpression": "cron(0 */6 * * ? *)",
    "scheduleTimezone": "Asia/Seoul",
    "anomalyFlexibleWindowMinutes": 60,
    "baselineCpu": 256,
    "baselineMemoryMiB": 512,
    "anomalyCpu": 1024,
    "anomalyMemoryMiB": 2048
  }
}
```

- `targetBaseUrl`: `unicorn-rental-init` 의 `LoadBalancerDnsName` output 으로 만든 절대 URL이다. 예: `http://my-alb-123.ap-northeast-2.elb.amazonaws.com`
- `baselineScheduleExpression`: steady traffic 주기다
- `anomalyScheduleExpression`: anomaly traffic 주기다
- `anomalyFlexibleWindowMinutes`: anomaly schedule jitter 범위다. `0` 이면 고정 시각 실행이다
- `baselineEnabled`, `anomalyEnabled`: Scheduler state 제어값이다

배포 절차와 수동 실행 예시는 [docs/deploy.md](docs/deploy.md) 에 정리했다.
