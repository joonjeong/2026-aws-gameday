# trial1 CDK 산출물

이 디렉터리는 `trial1/` 모의 훈련 중 작성한 CDK 코드를 보관한다. 실제 작업에 사용한 별도 솔루션은 상위 디렉터리의 `enigma/` 에 있으며, 이 디렉터리는 리허설에서 검증한 인프라 변경 아이디어를 재현하는 용도다.

## 포함된 스택

- `UnicornRentalObservabilityStack`: CloudWatch 대시보드와 관측성 레이어
- `UnicornRentalNetworkExtStack`: 네트워크 확장 관련 리소스
- `UnicornRentalFargateStack`: ECS Fargate 전환 및 트래픽 분산 관련 리소스

## 실행 기준

- 계정/리전은 `bin/cdk.ts` 에 고정되어 있다.
- 모의 훈련 당시 상태를 보존한 코드이므로, 재사용 전 환경값과 리소스 이름을 다시 검토해야 한다.
- 실제 작업 절차와 별개로, trial1 에서 어떤 IaC 접근을 시도했는지 확인할 때 참고한다.

## 기본 명령

```bash
npm install
npm run build
npm test
npx cdk synth
```

## 참고 문서

- [../infra-analysis.md](../infra-analysis.md): trial1 시작 시점 인프라 분석
- [../gameday-log.md](../gameday-log.md): trial1 작업 로그
