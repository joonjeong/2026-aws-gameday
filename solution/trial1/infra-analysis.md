# trial1 unicorn-rental 인프라 분석

분석 일시: 2026-04-05

이 문서는 `trial1/` 모의 훈련 시작 시점에 파악한 인프라 상태와 개선 우선순위를 정리한다. 실제 작업에 사용한 별도 솔루션과 운영 절차는 상위 디렉터리의 `enigma/` 문서를 기준으로 본다.

## 현재 구성 요약

| 리소스 | 값 |
|---|---|
| VPC | `unicorn-rental-vpc` (10.0.0.0/16) |
| Subnet | public x2 (ap-northeast-2a: 10.0.0.0/24, ap-northeast-2b: 10.0.1.0/24) |
| ALB | `unicorn-rental-alb` (internet-facing, HTTP:80) |
| ASG | `unicorn-rental-asg` (min:2, max:4, desired:2, t3.small) |
| Target Group | `unicorn-rental-tg` (HTTP:8080, /actuator/health) |
| EC2 | 2대 running / healthy, public subnet에 public IP 직접 할당 |
| CloudFormation | `UnicornRentalNetworkStack`, `UnicornRentalApplicationStack` |

---

## 취약점 및 개선점

### 🔴 심각 (보안)

#### 1. EC2 인스턴스 public subnet 직접 노출
- 현재: EC2가 public subnet에 위치하고 public IP 직접 할당 (`AssociatePublicIpAddress: true`)
- 위험: 앱 서버(8080)가 ALB를 우회하여 인터넷에서 직접 접근 가능
- 개선: private subnet 추가 + NAT Gateway 구성, EC2는 private subnet으로 이동

#### 2. SSH 22포트 전체 인터넷 허용
- 현재: App SG에 `0.0.0.0/0 → TCP:22` 허용 (의도적 bootstrap 설정)
- 위험: 브루트포스, 크리덴셜 탈취 시 서버 직접 침투 가능
- 개선: SSH 규칙 제거 + AWS Systems Manager Session Manager로 대체

#### 3. HTTP only, HTTPS 없음
- 현재: ALB 리스너가 HTTP:80만 존재
- 위험: 트래픽 평문 전송, 중간자 공격 가능
- 개선: ACM 인증서 발급 후 HTTPS:443 리스너 추가, HTTP → HTTPS 리다이렉트

---

### 🟡 중간 (가용성 / 운영)

#### 4. ASG Scaling Policy 없음
- 현재: `EnabledMetrics: []`, scaling policy 미설정
- 위험: 트래픽 급증 시 수동 개입 필요
- 개선: CPU 기반 Target Tracking Policy 추가 (목표 CPU 60%)

#### 5. HealthCheck 복구 감지 느림
- 현재: interval 30s × healthy threshold 5 = 최대 150초 소요
- 개선: interval 15s, healthy threshold 2로 조정 (복구 감지 30초)

#### 6. ALB Access Log 비활성화
- 현재: ALB access log 미설정
- 위험: 장애 분석, 보안 감사 시 트래픽 이력 없음
- 개선: S3 버킷에 access log 활성화

#### 7. EC2 Detailed Monitoring 비활성화
- 현재: `Monitoring.State: disabled` (5분 간격 기본 메트릭)
- 개선: Detailed Monitoring 활성화 (1분 간격)

---

### 🟢 낮음 (구조)

#### 8. private subnet 없음
- 현재: public subnet 2개만 존재, NAT Gateway 없음
- 개선: private subnet 추가 후 EC2 이동, NAT Gateway로 아웃바운드 처리

#### 9. ASG 메트릭 수집 안 됨
- 현재: `EnabledMetrics: []`
- 개선: ASG 그룹 메트릭 전체 활성화

---

## CDK 전략

기존 CloudFormation 스택(`UnicornRentalNetworkStack`, `UnicornRentalApplicationStack`)은 유지.  
새 CDK 스택(`UnicornRentalObservabilityStack`)에서 기존 리소스를 `fromLookup` / `fromAttributes`로 참조하여 관측성 레이어를 추가한다.

```
UnicornRentalNetworkStack      (기존 CFn, 유지)
UnicornRentalApplicationStack  (기존 CFn, 유지)
UnicornRentalObservabilityStack (신규 CDK)
  └─ CloudWatch Dashboard
  └─ (향후) Alarms, Log Groups
```

---

## 우선순위별 액션 아이템

| 우선순위 | 항목 | 예상 작업 |
|---|---|---|
| P0 | SSH 22 전체 허용 제거 | SG 규칙 삭제 + SSM 설정 |
| P0 | HTTPS 적용 | ACM + ALB 리스너 추가 |
| P1 | EC2 private subnet 이동 | private subnet + NAT GW 추가 |
| P1 | ASG Scaling Policy | Target Tracking 추가 |
| P2 | ALB Access Log | S3 버킷 + log 활성화 |
| P2 | HealthCheck 튜닝 | interval/threshold 조정 |
| P3 | Detailed Monitoring | Launch Template 수정 |
