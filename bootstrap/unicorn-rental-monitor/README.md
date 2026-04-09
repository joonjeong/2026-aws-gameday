# Unicorn Rental Monitor

`bootstrap/unicorn-rental-monitor` 는 GameDay 작업 0용 CloudWatch 대시보드 골격을 정의하는 신규 CDK 앱이다.

핵심 원칙:

- 리소스를 만들기 전에 대시보드 골격부터 CDK 로 정의한다.
- 대시보드 레이어 순서는 `ALB -> EC2 -> ECS -> DynamoDB -> RDS` 를 따른다.
- 위젯은 특정 리소스 이름에 고정하지 않고 `SEARCH` 표현식을 사용해 카테고리 전체 리소스를 대상으로 그린다.
- 각 검색 위젯은 expression label 을 비워 두어 legend 에서 개별 리소스 라벨이 그대로 보이게 한다.
- ECS 처럼 현재 리소스가 없을 수 있는 계층도 placeholder 성격의 빈 그래프를 유지해 후속 작업에서 실제 리소스를 연결할 수 있게 한다.

## 파일 구조

```text
unicorn-rental-monitor/
├── bin/
│   └── unicorn-rental-monitor.js
├── lib/
│   └── unicorn-rental-monitor-stack.js
├── test/
│   └── unicorn-rental-monitor-stack.test.js
├── cdk.json
└── package.json
```

## 기본 명령

```bash
npm install
npm test
npm run synth
```

배포 전 확인 포인트:

- 대시보드가 `AWS/ApplicationELB`, `AWS/EC2`, `AWS/ECS`, `AWS/DynamoDB`, `AWS/RDS` 네임스페이스를 모두 포함하는지
- 특정 리소스 이름이나 ARN 에 고정된 metric dimension 이 없는지
- 빈 계층도 제거하지 않고 유지되는지
