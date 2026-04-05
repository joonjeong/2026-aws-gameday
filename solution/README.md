# Unicorn Rental GameDay Solution

이 디렉터리는 GameDay 모의 훈련 결과와 실제 작업에 사용한 솔루션을 함께 보관한다. `trial1/` 은 리허설 산출물 모음이고, `enigma/` 는 실제 작업 시 사용한 트래픽 주입 도구다.

## 디렉터리 구성

- `trial1/`: 첫 모의 훈련에서 만든 분석 문서, 작업 로그, 애플리케이션/인프라 산출물
- `enigma/`: 실제 GameDay 대상 환경에 baseline/anomaly traffic 을 주입하기 위해 사용한 AWS CDK 앱

## 문서 안내

- [trial1/infra-analysis.md](trial1/infra-analysis.md): 모의 훈련 시작 시점의 인프라 진단과 개선 우선순위
- [trial1/gameday-log.md](trial1/gameday-log.md): 모의 훈련 중 수행한 조치와 시각별 결과
- [trial1/cdk/README.md](trial1/cdk/README.md): 모의 훈련에서 사용한 CDK 스택 설명
- [enigma/README.md](enigma/README.md): 실제 작업용 트래픽 주입 솔루션 개요
- [enigma/docs/deploy.md](enigma/docs/deploy.md): `enigma` 배포 및 운영 절차

## bootstrap에서 solution으로

`bootstrap/unicorn-rental-init` 는 GameDay 시작점 역할을 하는 거친 초기 환경이고, 이 `solution` 디렉터리는 그 환경을 진단하고 보완한 결과를 정리한다.

| bootstrap의 거친 상태 | solution에서 정리한 대응 |
|---|---|
| public subnet 기반 app EC2 | `trial1/cdk` 에서 private subnet/ECS 전환 리허설, 실제 대응용 도구는 `enigma` 로 분리 |
| 직접 SSH 가능한 운영 접근 | 보안 취약점 분석과 대체 운영 방식 기록 |
| 수동 변경과 drift 발생 쉬움 | 작업 로그와 IaC 산출물을 함께 보관해 재현 가능성 확보 |
| 일단 돌아가는 Java workload | 트래픽 주입, 관측, 전환 검증 흐름 문서화 |

## 사용 기준

- 리허설 결과를 확인할 때는 `trial1/` 부터 본다.
- 실제 작업에 투입한 도구와 절차를 확인할 때는 `enigma/` 문서를 본다.
- 새로운 GameDay 회차가 생기면 `trialN/` 과 실제 운영용 솔루션을 같은 기준으로 추가한다.
