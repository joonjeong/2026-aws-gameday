# Union Rental GameDay Solution

이 디렉터리는 intentionally minimal 상태로 비워 둔다.

## 역할

- [bootstrap README](/Users/joonjeong/workspace/2026-aws-gameday/bootstrap/unicorn-rental-init/README.md) 에서 만든 거친 초기 환경을 개선하는 작업영역
- 실제 GameDay 진행 중 풀어낸 해결책, 전환 전략, 검증 결과를 이후에 정리할 자리

## bootstrap에서 solution으로

| bootstrap의 거친 상태 | solution에서 다룰 방향 |
|---|---|
| public subnet 기반 app EC2 | private subnet 중심 배치 또는 ECS 전환 |
| 직접 SSH 가능한 운영 접근 | 자동화된 배포와 통제된 접근 |
| 수동 변경과 drift 발생 쉬움 | IaC, CI/CD, observability 강화 |
| 일단 돌아가는 Java workload | 점진적 배포, rollback 가능한 구조 |

## 현재 상태

- 현재는 README만 남긴 최소 구조다.
- 구체적인 solution 코드는 GameDay 진행 중 실제로 필요한 형태에 맞춰 다시 추가한다.

## 작성 템플릿

아래 섹션은 GameDay 진행 중 실제 solution을 정리할 때 채워 넣는다.

### 1. 문제 정의

- 증상:
- 영향 범위:
- 초기 가설:

### 2. 목표 상태

- 단기 복구 목표:
- 구조 개선 목표:
- bootstrap 대비 개선 포인트:

### 3. 구현 범위

- 이번에 바꾸는 것:
- 이번에는 일부러 안 바꾸는 것:
- 전제 조건:

### 4. 변경 내용

- 인프라:
- 애플리케이션:
- 배포:
- 관측성:
- 보안/접근 제어:

### 5. 검증

- 배포 확인:
- 기능 확인:
- 장애 복구 확인:
- 롤백 확인:
- 남은 검증 공백:

### 6. 리스크

- 현재 남아 있는 운영 리스크:
- GameDay 중 추가로 확인할 항목:
- 실제 운영 반영 전 별도 검토가 필요한 항목:

### 7. 다음 단계

- 즉시 후속 작업:
- GameDay 이후 정리할 작업:
