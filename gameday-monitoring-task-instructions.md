# GameDay 모니터링 작업 지시서

## 목적

이 문서는 GameDay 시작 전에 현재 운영 아키텍처를 파악하고, 그 결과를 바탕으로 대시보드, 알람, Slack 알림, Java APM 강화를 순서대로 진행하기 위한 작업 지시서다.

특히 아키텍처 파악 직후에는 운영자가 한 화면에서 빠르게 현재 상태를 볼 수 있도록 ALB, Target Group, EC2, ECS, DynamoDB, RDS 지표를 트래픽 흐름 순서대로 배치한 CloudWatch Dashboard 초안을 먼저 만들고, 그에 대응하는 초기 CloudWatch Alarm 세트도 바로 구성해야 한다. 이 초안은 CDK 로 작성하며, 현재 로그 그룹이나 메트릭 연결이 없어 즉시 렌더링이 어려운 경우에도 후속 연결 위치를 명확히 보여주는 panel placeholder 를 반드시 남긴다.

또한 CloudWatch Synthetics 를 초기에 도입해 더미 트래픽을 지속적으로 흘리고, 저트래픽 상황에서도 대시보드 지표가 살아 있는지, 알람이 얼마나 빨리 올라오고 수신되는지 검토할 수 있어야 한다.

이 지시서는 discovery-first 원칙을 따른다.

- 아키텍처는 이미 알고 있다고 가정하지 않는다.
- 저장소 내부의 모의 자산이나 리허설 산출물을 정답처럼 참조하지 않는다.
- 실제 AWS 환경과 현재 배포 구성을 먼저 식별한 뒤, 필요한 코드 변경 지점을 역으로 찾는다.

## 작업의 기본 전제

1. 현재 아키텍처는 미상이라고 가정한다.
2. 아키텍처 파악은 코드 요약이 아니라 실제 배포 환경 확인이 선행되어야 한다.
3. 애플리케이션 바이너리와 소스 위치도 미상이라고 가정한다.
4. EC2 기반 워크로드가 있다면 LaunchTemplate 의 EC2 UserData 를 반드시 확인해 다음을 찾아야 한다.
   - 바이너리를 어디에서 내려받는지
   - 애플리케이션 소스 사본을 어디에 두는지
   - 로컬 파일 경로가 무엇인지
   - 원격 저장 위치가 S3 인지, 다른 저장소인지
   - systemd 또는 프로세스 시작 명령이 무엇인지
5. 모니터링 설계는 아키텍처 파악 결과를 입력으로 삼아야 한다.
6. 아키텍처 현대화 가능성도 초기 분석 범위에 포함해야 한다.
7. 현대화가 필요하다고 판단되면, 변경 작업 전에 현재 인프라를 CDK 로 dump 하여 기준 상태를 먼저 기록해야 한다.

## 참조 우선순위

아래 순서대로 사실을 확인한다.

1. 실제 AWS 계정의 배포 리소스
2. CloudFormation stack / stack output / drift 상태
3. ALB, Target Group, Auto Scaling Group, LaunchTemplate, EC2, ECS, Lambda, RDS, DynamoDB, S3, Secrets Manager, CloudWatch, SNS, Chatbot/Amazon Q Developer 설정
4. LaunchTemplate UserData 와 인스턴스 부팅 방식
5. 그 다음에야 저장소 내 코드와 문서를 본다

## 권장 수행 순서

1. 아키텍처 파악
2. 트래픽 흐름 기준의 모니터링 대시보드 초안 생성
3. 대시보드와 대응되는 모니터링 알람 생성 및 CloudWatch Synthetics 기반 초기 검증
4. Slack 알람 채널 연동
5. CloudWatch Application Signals 기반 Java 모니터링 강화
6. GameDay 대응용 k6 스모크/로드 테스트 스크립트 준비

## 공통 원칙

- 추측하지 말고 확인한다.
- 실제 리소스 이름, ARN, ID, metric dimension 을 수집한다.
- 하드코딩이 이미 존재하면 그대로 답습하지 말고 근거를 확인한다.
- 코드 변경은 작고 되돌리기 쉽게 유지한다.
- 가능한 한 기존 스택과 관측 자산을 확장한다.
- 새 의존성은 특별한 이유가 없으면 추가하지 않는다.
- 아키텍처 파악이 끝나면 가장 먼저 운영자가 한눈에 보는 baseline dashboard 와 alarm 부터 세운다.
- 대시보드는 트래픽이 유입되는 순서대로 위에서 아래로 배치하고, 각 카테고리에는 해당 리소스 전부를 렌더링한다.
- 대시보드의 레이어 골격 자체는 현재 아키텍처와 무관하게 유지하고, 작업 1 결과는 각 레이어에 어떤 실제 리소스를 매핑할지 결정하는 입력으로 사용한다.
- EC2 와 ECS 는 메트릭 바로 아래에 로그를 배치하고, EC2 로그는 host/system 로그와 application 로그를 분리한다.
- CloudTrail 로그와 CloudTrail error 로그는 대시보드 최하단에서 볼 수 있어야 한다.
- 지금 즉시 로그/메트릭이 연결되지 않더라도 빈칸으로 남기지 말고 placeholder panel 을 둔다.
- CloudWatch Synthetics 는 저트래픽 환경 보강과 알람 반응 속도 검토를 위해 조기에 도입한다.
- 실제 사용자 트래픽이 이미 존재할 수 있으므로, 추가 부하 생성 작업은 안전장치와 중단 기준을 함께 설계한다.
- 최종 결과에는 변경 파일, 검증 결과, 남은 공백을 반드시 포함한다.

---

## 작업 1. 아키텍처 파악

### 목표

현재 운영 아키텍처, 배포 경로, 실행 경로, 데이터 저장소, 관측 경계, 장애 지점을 실제 환경 기준으로 식별한다.

### 필수 조사 항목

- 현재 외부 진입점이 무엇인지
- 실제 런타임이 EC2 인지, ECS 인지, 혼합 상태인지
- ALB 와 Target Group 이 어느 런타임으로 트래픽을 보내는지
- Auto Scaling Group 과 LaunchTemplate 존재 여부
- LaunchTemplate UserData 가 바이너리와 소스를 어디서 받아 어디에 두는지
- 애플리케이션 시작 명령, systemd 유닛 또는 컨테이너 entrypoint
- 애플리케이션이 호출하는 데이터 저장소와 외부 의존성
- 현재 존재하는 CloudWatch Dashboard, Alarm, SNS, Slack 채널 연동 상태

### 기대 산출물

- 현재 아키텍처 다이어그램 수준의 텍스트 설명
- 요청 흐름
- 실행 경로와 배포 경로
- 바이너리 저장 위치와 소스 저장 위치
- 모니터링 우선순위
- 현재 구성의 개선 포인트 체크리스트
- 현재 구성의 취약한 부분 체크리스트
- 아키텍처 현대화 가능성 평가
- GameDay 체크리스트 10개

### 검증 기준

- 사실과 추론이 분리되어 있어야 한다.
- LaunchTemplate UserData 기반으로 바이너리/소스 위치가 명시되어야 한다.
- “현재 있음 / 현재 없음”이 구분되어야 한다.

### 실행 프롬프트

```text
너는 AWS GameDay 사전점검을 수행하는 시니어 클라우드 아키텍트다. 작업 대상은 현재 Git 저장소의 최상위와 실제 AWS 배포 환경이다.

중요:
- 현재 아키텍처는 미상이라고 가정하고 시작해라.
- 저장소 내부의 모의 자산이나 리허설 산출물을 정답처럼 사용하지 마라.
- 실제 AWS 리소스를 먼저 조사하고, 그 다음에 코드 위치를 역추적해라.

가장 먼저 다음을 확인해라.
1. CloudFormation stack 목록과 주요 output
2. ALB, Listener, Target Group, Auto Scaling Group, LaunchTemplate, EC2, ECS Service/Cluster 존재 여부
3. DynamoDB, RDS, S3, Secrets Manager, SNS, CloudWatch Dashboard/Alarm 존재 여부
4. 현재 실제 트래픽이 어느 런타임으로 가는지

특히 EC2 기반 워크로드가 있다면 LaunchTemplate 의 EC2 UserData 를 반드시 읽고 다음을 찾아라.
- 바이너리를 어디에서 가져오는지
- 애플리케이션 소스 사본을 어디에 두는지
- 로컬 디렉터리 경로가 무엇인지
- S3 object key 또는 원격 저장 위치가 무엇인지
- systemd 유닛, 환경파일, 시작 명령이 무엇인지

그 다음 저장소 코드를 확인해 다음 내용을 한국어로 정리해라.
1. 전체 요청 흐름
2. 실제 런타임 구성: EC2, ECS, 둘 다, 혹은 전환 중인지
3. 네트워크 구조와 공개/비공개 경계
4. 데이터 저장소별 역할
5. 부팅/배포 흐름
6. LaunchTemplate UserData 로 확인한 바이너리 위치와 소스 위치
7. 현재 존재하는 관측 자산과 없는 관측 자산
8. GameDay 중 가장 취약한 실패 지점
9. 대시보드와 알람이 우선 커버해야 할 리소스 순위
10. 현재 구성의 개선 포인트 체크리스트
11. 현재 구성의 취약한 부분 체크리스트
12. 아키텍처 현대화 가능성 평가
13. 현대화가 필요하다고 판단될 경우, 왜 필요한지와 어떤 범위를 CDK dump 로 먼저 기준화해야 하는지
14. 확인에 사용한 리소스, 파일 경로, 코드 근거

중요:
- 추측하지 말고 확인한 사실과 합리적 추론을 분리해라.
- 아직 구현되지 않은 모니터링 리소스는 “현재 없음”으로 적어라.
- 개선 포인트 체크리스트와 취약점 체크리스트는 실행 가능한 항목 위주로 작성해라.
- 아키텍처 현대화는 ECS/Fargate 전환, private subnet 전환, HTTPS 종단, 운영 접근 통제, 배포 자동화, 관측성 표준화 같은 후보를 포함해 검토하되, 실제 환경 근거가 있을 때만 제안해라.
- 현대화가 필요하다면 구현 전에 반드시 현재 인프라를 CDK 로 dump 하여 기준 상태를 남겨야 한다는 점을 기록해라.
- 마지막에 “GameDay 시작 전 체크리스트 10개”를 포함해라.
- 코드 수정은 하지 말고 분석 결과만 작성해라.
```

---

## 작업 2. 레이어 기반 모니터링 대시보드 초안 생성

### 목표

작업 1에서 파악한 실제 리소스를 기준으로, 운영자가 트래픽 흐름을 따라 위에서 아래로 한눈에 볼 수 있는 CloudWatch Dashboard 초안을 CDK 로 생성하거나 정리한다. 이때 대시보드의 레이어 구조 자체는 현재 아키텍처와 무관하게 유지하고, 실제 리소스 식별 결과는 각 레이어에 무엇을 연결할지 결정하는 데 사용한다.

### 설계 원칙

- 먼저 현재 이미 존재하는 대시보드가 있는지 확인한다.
- 있으면 확장할지 교체할지 판단 근거를 남긴다.
- 없으면 실제 리소스 dimension 을 사용해 새로 만든다.
- 초안은 아키텍처 파악 직후 가능한 한 빨리 배포 가능한 수준까지 만든다.
- 대시보드 구조는 트래픽 유입 순서를 따라 위에서 아래로 배치한다.
- 레이어 골격은 아키텍처와 무관하게 고정한다. 기본 레이어는 서비스 전체 건강도, ALB, Target Group, EC2, ECS, DynamoDB, RDS, CloudTrail, Synthetics/Application Signals placeholder 다.
- 어떤 레이어가 현재 실제 아키텍처에 없더라도 해당 섹션을 제거하지 말고 placeholder panel 로 남긴다.
- 단일 리소스만 고정해서 보여주지 말고, 카테고리 단위(ALB, Target Group, EC2, ECS, DynamoDB, RDS 등)로 해당하는 실제 리소스 전부를 차트에 렌더링한다.
- 위젯은 “가용성”, “지연”, “용량”, “오류”, “의존성 상태” 기준으로 배치하되, 카테고리별로 묶어 읽기 쉽게 만든다.
- EC2 와 ECS 는 메트릭 위젯 바로 아래에 로그 위젯을 둬서 지표와 로그를 함께 보게 한다.
- EC2 로그는 host/system 로그와 application 로그를 분리해 각각 독립된 패널로 둔다.
- CloudTrail 로그와 CloudTrail error 로그는 대시보드 최하단에 별도 패널로 둔다.
- 애플리케이션 계층 메트릭이 아직 없으면 AWS managed metrics 중심으로 먼저 완성한다.
- 로그 그룹이나 메트릭이 아직 없어 현재 렌더링이 어려운 경우, panel placeholder 를 남겨 후속 연결 지점을 명확히 한다.

### 최소 포함 범주

- 서비스 전체 건강도 요약
- ALB / Target Group
- EC2
- ECS
- DynamoDB
- RDS 또는 기타 주 저장소가 있으면 포함
- EC2 host/system 로그
- EC2 application 로그
- ECS 로그
- CloudTrail 로그
- CloudTrail error 로그
- 필요 시 SNS, Lambda, SQS 같은 부가 의존성
- CloudWatch Synthetics placeholder 또는 연동 지점
- Application Signals 도입 후 붙일 placeholder

### 검증 기준

- 관련 CDK 앱 또는 IaC 경로에서 synth 성공
- 기존 자산과 충돌 여부 확인
- 각 필수 카테고리 패널이 실제 위젯 또는 placeholder 형태로 모두 존재해야 한다.
- 현재 미사용 레이어도 placeholder 로 남아 있어야 한다.

### 실행 프롬프트

```text
너는 AWS CloudWatch 운영 가시성을 구현하는 엔지니어다. 작업 대상은 현재 Git 저장소의 최상위와 실제 AWS 배포 환경이다.

중요:
- 먼저 아키텍처를 안다고 가정하지 마라.
- 작업 1 결과를 입력으로 사용하되, 필요한 리소스 식별자는 다시 검증해라.
- 저장소 내부의 모의 자산이나 리허설 산출물을 기준 구현물로 삼지 마라.

해야 할 일:
- 현재 실제 운영 리소스를 기준으로 CloudWatch Dashboard 를 생성하거나 정리해라.
- 먼저 현재 계정에 이미 존재하는 Dashboard 가 있는지 확인하고, 있으면 재사용/확장 여부를 결정해라.
- 코드 수정이 필요하면 현재 실제 운영 IaC 가 위치한 경로를 찾아 그 위치만 수정해라.
- 초안은 CDK 로 작성해라.
- 작업 1 결과는 각 레이어에 어떤 실제 리소스를 연결할지 결정하는 입력으로 사용하되, 레이어 자체를 생략하는 근거로 사용하지 마라.

대시보드 구성 원칙:
- 첫 줄은 서비스 전체 건강도
- 그 다음부터는 트래픽이 들어오는 순서대로 위에서 아래로 배치해라.
- 진입 계층은 ALB 다음 Target Group 순서로 둬라.
- 런타임 계층은 Target Group 아래에 EC2 와 ECS 를 각각 독립 카테고리로 항상 배치해라.
- EC2 메트릭 아래에는 host/system 로그 패널과 application 로그 패널을 분리해 배치해라.
- ECS 메트릭 아래에는 ECS 로그 패널을 배치해라.
- 데이터 계층은 DynamoDB, RDS 순으로 배치해라.
- 대시보드 최하단에는 CloudTrail 로그와 CloudTrail error 로그를 배치해라.
- 향후 Application Signals / JVM / 애플리케이션 위젯 placeholder 도 남겨라.

필수 요구사항:
- 리소스 이름과 metric dimension 은 실제 환경 기준으로 확인해서 사용해라.
- 하드코딩이 이미 있으면 그대로 복제하지 말고 지금도 유효한지 검증해라.
- 현재 바로 수집 가능한 AWS managed metrics 중심으로 먼저 완성해라.
- 단일 리소스 하나만 보여주지 말고, 카테고리에 속하는 실제 리소스 전부를 차트에 렌더링해라.
- 로그 그룹이나 메트릭 연결이 아직 없어 지금 당장 렌더링이 어려운 경우에는 해당 위치에 placeholder panel 을 남겨라.
- 현재 사용하지 않는 레이어라도 섹션 자체를 제거하지 말고 “현재 리소스 없음” 성격의 placeholder panel 을 남겨라.
- 애플리케이션 메트릭이 아직 없다면 optional 섹션으로 분리하되 패널 위치는 유지해라.

결과물:
- 변경된 파일
- Dashboard 이름
- 위젯 배치 이유
- 아직 비어 있는 관측 공백
- 검증 명령과 결과
```

---

## 작업 3. 대시보드 기반 알람 생성

### 목표

대시보드에서 가장 중요한 운영 리스크를 기준으로 CloudWatch Alarm 과 SNS 기반 알림 체계를 빠르게 구성하고, CloudWatch Synthetics 기반 더미 트래픽으로 저트래픽 상황에서도 알람 반응 속도를 검토할 수 있게 한다.

### 설계 원칙

- 먼저 기존 알람과 SNS 토픽을 조사한다.
- 중복 알람을 새로 만들지 않는다.
- 알람 세트는 작업 2의 대시보드 초안과 같은 카테고리 구성을 기준으로 맞춘다.
- GameDay 상황을 고려해 장애를 빨리 잡을 수 있도록 평시 운영보다 더 타이트하게 설정한다.
- 단, 저트래픽 환경의 통계 왜곡으로 발생하는 오탐은 metric 선택과 evaluation 방식으로 제어한다.
- `Critical` 과 `Warning` 을 구분한다.
- 가능하면 Composite Alarm 으로 노이즈를 줄인다.
- CloudWatch Synthetics 를 조기에 도입해 더미 트래픽을 흘리고, ALB/Target Group/런타임 계층 알람이 얼마나 빨리 발화하는지 검토한다.
- Slack 연동이 아직 없더라도 우선 Alarm state 전이와 SNS 흐름을 확인하고, 이후 Slack 연결 뒤 같은 synthetic 흐름으로 end-to-end 수신을 재검증할 수 있게 설계한다.

### 최소 포함 범주

- ALB unhealthy target / unhealthy host
- 5xx 증가
- 응답 시간 악화
- EC2 status check 실패 또는 ECS task 감소
- ASG in-service 인스턴스 감소 또는 ECS desired 대비 running 감소
- DynamoDB throttle / system error
- RDS CPU / connection / free storage / memory 이상
- CloudWatch Synthetics canary 실패 또는 비정상 latency

### 검증 기준

- 관련 IaC 경로에서 synth 성공
- 알람 대상 SNS 흐름 확인
- CloudWatch Synthetics 더미 트래픽 또는 동등한 안전한 방식으로 저트래픽에서도 알람 반응 여부를 검토한 근거가 있어야 한다.

### 실행 프롬프트

```text
너는 GameDay 운영 알람 설계를 담당하는 SRE 다. 작업 대상은 현재 Git 저장소의 최상위와 실제 AWS 배포 환경이다.

중요:
- 먼저 기존 알람과 SNS topic 을 조사해라.
- 현재 아키텍처를 안다고 가정하지 마라.
- 작업 1과 2 결과를 입력으로 사용하되, 실제 리소스와 metric 을 다시 확인해라.

해야 할 일:
- 현재 운영 환경에 맞는 CloudWatch Alarm 세트를 정의해라.
- 기존 알람이 있으면 유지, 통합, 교체 여부를 근거와 함께 결정해라.
- 알람은 이후 Slack 채널로 연결될 수 있도록 SNS 중심으로 설계해라.
- GameDay 대응 목적이므로 알람 임계치와 evaluation period 는 평시 운영보다 더 타이트하게 잡아라.
- 다만 저트래픽 서비스에서 단순 request count 기반 오탐이 나지 않도록 분모가 작은 비율/절대값 지표는 보정해라.
- 가능한 한 초기에 CloudWatch Synthetics canary 를 도입해 더미 트래픽을 흘리고, 그 결과로 어떤 알람이 얼마나 빨리 올라오는지 검토해라.

반드시 포함할 판단 축:
1. 진입 계층 장애
2. 현재 런타임 장애
3. 데이터 계층 장애
4. 성능 저하
5. 노이즈 제어
6. GameDay 대응 속도
7. 저트래픽 상황 보강을 위한 synthetic traffic 활용

출력 형식:
1. 알람 이름
2. 대상 metric
3. threshold 와 evaluation period
4. severity
5. 이유
6. 예상 런북 방향

구현 원칙:
- 실제 환경의 리소스 식별자를 다시 확인해라.
- 하드코딩 ARN 이 있으면 현재 값과 일치하는지 검증해라.
- 새 의존성은 추가하지 마라.
- README 또는 주석에 threshold rationale 을 짧게 남겨라.
- 각 알람에 대해 “왜 GameDay 기준으로 이 정도로 타이트하게 잡는지”를 설명해라.
- ALB, Target Group, EC2, ECS, DynamoDB, RDS 에 대해 카테고리별 기본 알람 세트를 빠르게 우선 구축해라.
- Synthetics 를 도입했다면 dummy traffic 으로 확인 가능한 알람 후보와 한계를 함께 적어라.
- Slack 이 아직 연결되지 않았다면 현재 단계에서 검증 가능한 것은 Alarm state 와 SNS 까지라는 점을 명시하고, Slack 연결 후 같은 synthetic flow 로 재검증 절차를 적어라.

마지막에는 “GameDay 중 가장 먼저 보게 될 알람 5개”를 우선순위대로 정리해라.
```

---

## 작업 4. Slack 알람 채널 연동

### 목표

CloudWatch Alarm -> SNS -> Slack 채널 흐름을 구성한다.

### 설계 원칙

- 먼저 현재 SNS topic 과 Slack 연동 상태를 조사한다.
- 수동 선행작업이 필요한 부분은 문서화한다.
- 값이 없으면 배포가 깨지지 않도록 optional 하게 설계한다.
- 운영 채널 권한은 최소화한다.

### 필수 설정값

- `enableSlackNotifications`
- `slackWorkspaceId`
- `slackChannelId`
- `slackChannelName`
- `slackConfigurationName`

### 검증 기준

- Slack 값이 없을 때도 synth 성공
- Slack 값이 있을 때도 synth 성공
- 가능하면 작업 3의 CloudWatch Synthetics 또는 동등한 테스트 흐름으로 end-to-end 알람 수신 검토 절차가 있어야 한다.

### 실행 프롬프트

```text
너는 AWS 알림 채널 통합을 구현하는 엔지니어다. 작업 대상은 현재 Git 저장소의 최상위와 실제 AWS 배포 환경이다.

중요:
- 먼저 현재 SNS topic 과 Slack 연동 상태를 조사해라.
- 이미 연결된 채널이 있으면 중복 생성하지 마라.
- 저장소 내부의 모의 자산이나 리허설 산출물을 기준 구현물로 삼지 마라.

목표:
- CloudWatch Alarm -> SNS -> Slack 채널 알림 흐름을 구성해라.
- Slack 연동은 현재 AWS 문서 기준 Amazon Q Developer in chat applications 로 설정하되, CloudFormation 리소스 타입은 AWS::Chatbot::SlackChannelConfiguration 을 사용해라.
- 작업 3에서 도입한 CloudWatch Synthetics 더미 트래픽 또는 그에 준하는 안전한 테스트 흐름으로 Slack 수신 검토가 가능하도록 운영 절차를 적어라.

구현 요구사항:
- 기존 또는 새 SNS alarm topic 을 Slack 채널 설정에 연결해라.
- 다음 값이 없으면 Slack 리소스는 만들지 않고 synth/deploy 가 깨지지 않게 해라.
  - enableSlackNotifications
  - slackWorkspaceId
  - slackChannelId
  - slackChannelName
  - slackConfigurationName
- 최초 workspace 승인 등 콘솔 선행작업이 있으면 문서에 적어라.
- 기본 모드는 notification 중심으로 두고, 과도한 권한의 채널 role 은 피하라.

최종 결과에는 다음을 포함해라.
- 수동 선행작업
- 필요한 context 또는 config 예시
- 배포 후 확인 방법
- 보안상 주의사항
```

---

## 작업 5. CloudWatch Application Signals 기반 Java 모니터링 강화

### 목표

현재 실제 Java 런타임에 맞는 CloudWatch Application Signals 구성을 추가해 애플리케이션 및 JVM 관측성을 강화한다.

### 핵심 전제

- 먼저 현재 Java 애플리케이션이 EC2 에서 실행되는지, ECS 에서 실행되는지, 둘 다 존재하는지 확인한다.
- 실행 형태에 따라 적용 방식이 달라진다.
- EC2 경로가 있다면 LaunchTemplate UserData 와 시작 스크립트, systemd 를 본다.
- ECS 경로가 있다면 task definition, container image, logging, sidecar 가능 여부를 본다.

### 필수 확인 항목

- Java 실행 명령
- 바이너리 위치
- 소스 또는 소스 사본 위치
- 환경변수 주입 방식
- CloudWatch Agent 또는 sidecar 배치 가능 위치
- 로그 경로와 로그 드라이버

### 검증 기준

- 관련 IaC 경로에서 synth 성공
- 애플리케이션 기동 경로가 깨지지 않아야 한다
- Application Signals 미활성 상태에서도 fail-safe 해야 한다

### 실행 프롬프트

```text
너는 Java 애플리케이션 관측성 강화를 담당하는 엔지니어다. 작업 대상은 현재 Git 저장소의 최상위와 실제 AWS 배포 환경이다.

중요:
- 먼저 현재 Java 런타임을 파악해라. EC2 인지, ECS 인지, 둘 다인지 확인해야 한다.
- 현재 아키텍처를 안다고 가정하지 마라.
- 바이너리와 소스 위치도 미상이라고 가정해라.

반드시 먼저 확인할 것:
1. EC2 경로가 있으면 LaunchTemplate 의 EC2 UserData
2. UserData 에서 바이너리 다운로드 위치, 소스 사본 위치, 로컬 경로, 시작 명령, 환경파일 위치
3. ECS 경로가 있으면 Task Definition, Container image, EntryPoint/Command, environment, log driver
4. 현재 CloudWatch Agent 또는 애플리케이션 telemetry 설정 존재 여부

그 다음 실제 런타임에 맞게 CloudWatch Application Signals 강화 방안을 구현해라.

필수 구현 목표:
- Java auto-instrumentation 적용
- Application Signals metrics/traces 수집 경로 구성
- service.name, deployment.environment 등 리소스 속성 명시
- JVM runtime metrics 고려
- 애플리케이션 기동 실패를 유발하지 않는 fail-safe 구성

설계 조건:
- EC2 경로라면 LaunchTemplate/UserData/systemd 를 통해 넣어라.
- ECS 경로라면 task definition/container/sidecar 구성을 통해 넣어라.
- 현재 운영 경로와 다른 런타임에 대한 내용은 “추가 parity 작업”으로 분리해라.
- ADOT Java agent 는 1.32.6 이상 기준으로 잡아라.

가능하면 다음도 포함해라.
- 로그 상관분석 방안
- 수동 검증 절차
- 기대되는 신규 관측 항목
- 아키텍처 현대화와의 연결 지점
- 남는 한계와 후속 작업
```

---

## 작업 6. GameDay 대응용 k6 스모크/로드 테스트 스크립트 준비

### 목표

GameDay 중 실제 트래픽이 존재하는 상황을 고려하면서도, 운영에 무리가 가지 않는 범위에서 상태 확인과 재현 가능한 부하 검증이 가능하도록 `k6` 스크립트를 준비한다.

### 설계 원칙

- 먼저 Java 애플리케이션 코드를 분석해 실제 엔드포인트, 요청 방식, 상태 전이, 필수 파라미터를 파악한다.
- 엔드포인트는 추측으로 만들지 않는다.
- 실제 운영 트래픽이 존재할 수 있으므로 스모크 테스트는 저충격, 로드 테스트는 통제된 램프업과 중단 기준을 가져야 한다.
- 쓰기 부하가 필요한 경우에도 파괴적이지 않은 데이터 패턴 또는 복구 가능한 테스트 패턴을 우선 사용한다.
- 애플리케이션 런타임이 EC2 이든 ECS 이든, 최종 타깃 URL 은 현재 실제 진입점 기준으로 결정한다.

### 필수 산출물

- `k6` 스모크 테스트 스크립트
- `k6` 로드 테스트 스크립트
- 각 시나리오의 목적, 호출 엔드포인트, 안전장치 설명
- 실행 방법
- 중단 조건과 관찰 포인트

### 필수 포함 사항

- Java 앱 소스 분석을 통해 시나리오를 구성했다는 근거
- health/read/list/write 중 어떤 경로를 선택했는지와 이유
- 기본 `BASE_URL` 또는 주입 방식
- 실제 GameDay 중 사용 가능한 최소/표준 옵션
- CloudWatch 대시보드와 알람을 보면서 어떤 지표를 같이 볼지

### 검증 기준

- 스크립트 문법이 유효해야 한다.
- 스모크 테스트는 기본적으로 짧고 안전해야 한다.
- 로드 테스트는 ramp-up, steady-state, ramp-down 을 가져야 한다.
- 실제 운영에 위험한 파괴적 패턴은 제외하거나 명시적으로 opt-in 이어야 한다.

### 실행 프롬프트

```text
너는 GameDay 중 사용할 트래픽 검증 스크립트를 준비하는 성능 테스트 엔지니어다. 작업 대상은 현재 Git 저장소의 최상위와 실제 AWS 배포 환경이다.

중요:
- 현재 아키텍처를 안다고 가정하지 마라.
- 실제 서비스에는 이미 실제 트래픽이 들어오고 있을 수 있다고 가정해라.
- 따라서 테스트는 GameDay 운영을 보조하는 목적이어야 하며, 불필요하게 파괴적이면 안 된다.
- 저장소 내부의 모의 자산이나 리허설 산출물을 정답처럼 사용하지 마라.

반드시 먼저 할 일:
1. Java 애플리케이션 소스를 분석해 실제 HTTP 엔드포인트, 메서드, 요청/응답 형식, 상태코드, 필수 파라미터를 파악해라.
2. 현재 실제 진입점이 ALB 인지 다른 엔드포인트인지 확인해라.
3. 실제 GameDay 중 안전하게 호출 가능한 엔드포인트와 주의가 필요한 엔드포인트를 구분해라.
4. 쓰기 요청이 있다면 데이터 부작용과 복구 가능성을 먼저 평가해라.

그 다음 `k6` 스크립트를 준비해라.

필수 요구사항:
- 트래픽 유형은 두 가지다.
  - smoke test
  - load test
- 두 스크립트 모두 Java 앱 분석 결과를 기반으로 시나리오를 구성해라.
- 엔드포인트는 추측으로 만들지 말고 코드 분석 근거를 남겨라.
- smoke test 는 저충격 상태 검증 목적이어야 한다.
- load test 는 GameDay 상황에 맞게 통제된 램프업, 유지, 램프다운을 포함해야 한다.
- 실제 트래픽이 있는 상황을 고려해 기본 부하 강도는 보수적으로 시작하고, 필요시 환경변수로 조절 가능하게 해라.
- `BASE_URL`, stage 설정, VU 수, duration, threshold 는 환경변수로 오버라이드 가능하게 설계해라.
- 스크립트는 기본적으로 안전한 읽기/헬스체크 경로 중심으로 구성하고, 쓰기 경로는 명시적 opt-in 일 때만 실행되게 해라.

최종 결과에는 다음을 포함해라.
1. 생성한 k6 스크립트 파일
2. 각 스크립트의 시나리오 설명
3. 어떤 Java 엔드포인트 분석을 근거로 삼았는지
4. smoke test 와 load test 의 차이
5. 실제 GameDay 중 권장 실행 순서
6. 테스트 중 같이 봐야 할 CloudWatch 대시보드/알람/로그 포인트
7. 중단 조건

가능하면 다음도 포함해라.
- 정상 응답 기준 threshold
- 실패율 threshold
- latency threshold
- 운영 중 안전하게 부하를 점진 확대하는 방법
```

---

## 최종 결과 보고 형식

각 작업 완료 시 아래 형식을 유지한다.

1. 확인한 사실
2. 수정한 파일
3. 검증한 항목
4. 남아 있는 공백
5. 다음 작업으로 넘길 입력

## 문서 사용 방식

- 이 문서는 순차 실행형이다.
- 작업 1 결과 없이 작업 2~6를 진행하지 않는다.
- 특히 바이너리/소스 위치와 실행 경로는 LaunchTemplate UserData 또는 실제 런타임 정의에서 확인하기 전까지 가정하지 않는다.
- 작업 1에서 현대화 필요성이 확인되면, 구현 착수 전에 현재 인프라를 CDK 로 dump 하여 기준 상태를 남기는 단계를 선행한다.
