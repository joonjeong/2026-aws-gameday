import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

// ─── 실제 환경에서 확인한 리소스 식별자 ───────────────────────────────────────
const ECS = {
  clusterName: 'unicorn-rental-complex-cluster',
  serviceName: 'unicorn-rental-complex-svc',
  // ECS 전용 TG (ip 타입, Fargate)
  tgDimension: 'targetgroup/unicorn-rental-complex-ecs-tg/5fecb29af29bc675',
};

const RESOURCES = {
  albName: 'unicorn-rental-complex-alb',
  albArn: 'arn:aws:elasticloadbalancing:ap-northeast-2:075647413732:loadbalancer/app/unicorn-rental-complex-alb/7f0767a843d3c190',
  // ALB dimension에 사용하는 짧은 suffix: loadbalancer/app/<name>/<id>
  albDimension: 'app/unicorn-rental-complex-alb/7f0767a843d3c190',
  tgArn: 'arn:aws:elasticloadbalancing:ap-northeast-2:075647413732:targetgroup/unicorn-rental-complex-tg/c6066cba760077d9',
  // TG dimension: targetgroup/<name>/<id>
  tgDimension: 'targetgroup/unicorn-rental-complex-tg/c6066cba760077d9',
  asgName: 'unicorn-rental-complex-asg',
  rdsId: 'unicornrentalcomplexappli-postgresdatabase0a8a7373-pao9fozmhtg5',
  dynamoTable: 'unicorn-rental-complex-sessions',
  region: 'ap-northeast-2',
};

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── SNS 알람 토픽 ──────────────────────────────────────────────────────
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'unicorn-rental-complex-alarms',
      displayName: 'Unicorn Rental Complex Alarms',
    });

    // ─── 메트릭 정의 ────────────────────────────────────────────────────────

    // ALB
    const albDims = {
      LoadBalancer: RESOURCES.albDimension,
    };
    const tgDims = {
      LoadBalancer: RESOURCES.albDimension,
      TargetGroup: RESOURCES.tgDimension,
    };

    const unhealthyHostCount = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'UnHealthyHostCount',
      dimensionsMap: tgDims,
      statistic: 'Maximum',
      period: cdk.Duration.minutes(1),
    });

    const healthyHostCount = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HealthyHostCount',
      dimensionsMap: tgDims,
      statistic: 'Minimum',
      period: cdk.Duration.minutes(1),
    });

    const alb5xx = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_ELB_5XX_Count',
      dimensionsMap: albDims,
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const target5xx = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_Target_5XX_Count',
      dimensionsMap: tgDims,
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const responseTime = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'TargetResponseTime',
      dimensionsMap: tgDims,
      statistic: 'p99',
      period: cdk.Duration.minutes(1),
    });

    const requestCount = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
      dimensionsMap: tgDims,
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    // EC2 / ASG
    const asgDims = { AutoScalingGroupName: RESOURCES.asgName };

    const ec2Cpu = new cloudwatch.Metric({
      namespace: 'AWS/EC2',
      metricName: 'CPUUtilization',
      dimensionsMap: asgDims,
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    const ec2NetworkIn = new cloudwatch.Metric({
      namespace: 'AWS/EC2',
      metricName: 'NetworkIn',
      dimensionsMap: asgDims,
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const ec2NetworkOut = new cloudwatch.Metric({
      namespace: 'AWS/EC2',
      metricName: 'NetworkOut',
      dimensionsMap: asgDims,
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    // RDS
    const rdsDims = { DBInstanceIdentifier: RESOURCES.rdsId };

    const rdsCpu = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'CPUUtilization',
      dimensionsMap: rdsDims,
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    const rdsConnections = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'DatabaseConnections',
      dimensionsMap: rdsDims,
      statistic: 'Maximum',
      period: cdk.Duration.minutes(1),
    });

    const rdsFreeStorage = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'FreeStorageSpace',
      dimensionsMap: rdsDims,
      statistic: 'Minimum',
      period: cdk.Duration.minutes(5),
    });

    const rdsFreeMemory = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'FreeableMemory',
      dimensionsMap: rdsDims,
      statistic: 'Minimum',
      period: cdk.Duration.minutes(1),
    });

    const rdsReadLatency = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'ReadLatency',
      dimensionsMap: rdsDims,
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    const rdsWriteLatency = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'WriteLatency',
      dimensionsMap: rdsDims,
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    // DynamoDB
    const ddDims = { TableName: RESOURCES.dynamoTable };

    const ddReadThrottle = new cloudwatch.Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'ReadThrottleEvents',
      dimensionsMap: ddDims,
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const ddWriteThrottle = new cloudwatch.Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'WriteThrottleEvents',
      dimensionsMap: ddDims,
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const ddSystemErrors = new cloudwatch.Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'SystemErrors',
      dimensionsMap: ddDims,
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const ddSuccessfulRequests = new cloudwatch.Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'SuccessfulRequestLatency',
      dimensionsMap: { ...ddDims, Operation: 'GetItem' },
      statistic: 'p99',
      period: cdk.Duration.minutes(1),
    });

    // ─── CloudWatch 알람 ─────────────────────────────────────────────────────
    const alarmAction = new actions.SnsAction(alarmTopic);

    // [CRITICAL] Unhealthy Host 1개 이상 → 즉시 대응
    // GameDay 기준: 2개 인스턴스 중 1개라도 Unhealthy면 즉시 알람
    const unhealthyHostAlarm = new cloudwatch.Alarm(this, 'UnhealthyHostAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-unhealthy-host',
      alarmDescription: '[CRITICAL] ALB Target Group에 Unhealthy 인스턴스 존재. 즉시 EC2 상태 확인 필요.',
      metric: unhealthyHostCount,
      threshold: 0,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      // 2분 연속 Unhealthy 인스턴스 존재 시 알람
      // GameDay: 빠른 감지 우선, 1회성 flap 방지를 위해 2회 평가
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    unhealthyHostAlarm.addAlarmAction(alarmAction);
    unhealthyHostAlarm.addOkAction(alarmAction);

    // [CRITICAL] Healthy Host 0개 → 전체 서비스 중단
    const noHealthyHostAlarm = new cloudwatch.Alarm(this, 'NoHealthyHostAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-no-healthy-host',
      alarmDescription: '[CRITICAL] Healthy 인스턴스 없음. 서비스 완전 중단 상태.',
      metric: healthyHostCount,
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    noHealthyHostAlarm.addAlarmAction(alarmAction);
    noHealthyHostAlarm.addOkAction(alarmAction);

    // [CRITICAL] 5xx 급증 → 애플리케이션 오류
    // GameDay: 1분 내 5xx 10건 이상이면 즉시 알람
    // 저트래픽 환경에서 절대값 기준 사용 (비율 계산 시 분모=0 오탐 방지)
    const target5xxAlarm = new cloudwatch.Alarm(this, 'Target5xxAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-target-5xx',
      alarmDescription: '[CRITICAL] 애플리케이션 5xx 오류 급증. RDS/DynamoDB 연결 또는 앱 오류 확인 필요.',
      metric: target5xx,
      threshold: 10,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    target5xxAlarm.addAlarmAction(alarmAction);
    target5xxAlarm.addOkAction(alarmAction);

    // [CRITICAL] 응답 시간 p99 > 3초 → 심각한 성능 저하
    // GameDay: 정상 응답 기준 1초 이하, 3초 초과 시 사용자 경험 심각 저하
    const responseTimeAlarm = new cloudwatch.Alarm(this, 'ResponseTimeAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-response-time-p99',
      alarmDescription: '[CRITICAL] p99 응답 시간 3초 초과. RDS 쿼리 또는 DynamoDB 지연 확인 필요.',
      metric: responseTime,
      threshold: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    responseTimeAlarm.addAlarmAction(alarmAction);
    responseTimeAlarm.addOkAction(alarmAction);

    // [WARNING] EC2 CPU > 80% → 스케일링 지연 또는 과부하
    // GameDay: Target Tracking 60% 기준이지만 실제 80% 초과 시 스케일링 지연 가능
    const ec2CpuAlarm = new cloudwatch.Alarm(this, 'Ec2CpuAlarm', {
      alarmName: 'unicorn-rental-WARNING-ec2-cpu-high',
      alarmDescription: '[WARNING] EC2 CPU 80% 초과. 스케일링 지연 또는 과부하 상태.',
      metric: ec2Cpu,
      threshold: 80,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ec2CpuAlarm.addAlarmAction(alarmAction);
    ec2CpuAlarm.addOkAction(alarmAction);

    // [CRITICAL] RDS CPU > 80% → DB 병목
    // GameDay: db.t3.micro는 CPU 제약이 심함. 80% 초과 시 쿼리 지연 급증
    const rdsCpuAlarm = new cloudwatch.Alarm(this, 'RdsCpuAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-rds-cpu-high',
      alarmDescription: '[CRITICAL] RDS CPU 80% 초과. 쿼리 최적화 또는 인스턴스 업그레이드 필요.',
      metric: rdsCpu,
      threshold: 80,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    rdsCpuAlarm.addAlarmAction(alarmAction);
    rdsCpuAlarm.addOkAction(alarmAction);

    // [CRITICAL] RDS 연결 수 > 80 → 연결 풀 고갈 임박
    // GameDay: HikariCP max-pool-size=10, 인스턴스 2개 → 최대 20개 연결
    // db.t3.micro max_connections ≈ 85. 80 초과 시 연결 거부 임박
    const rdsConnectionAlarm = new cloudwatch.Alarm(this, 'RdsConnectionAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-rds-connections-high',
      alarmDescription: '[CRITICAL] RDS 연결 수 80 초과. db.t3.micro max_connections 한계 임박. 연결 거부 가능.',
      metric: rdsConnections,
      threshold: 80,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    rdsConnectionAlarm.addAlarmAction(alarmAction);
    rdsConnectionAlarm.addOkAction(alarmAction);

    // [CRITICAL] RDS 여유 스토리지 < 10GB → 디스크 고갈 위험
    // GameDay: 100GB 할당, 10GB 미만 시 알람 (10% 기준)
    const rdsFreeStorageAlarm = new cloudwatch.Alarm(this, 'RdsFreeStorageAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-rds-free-storage-low',
      alarmDescription: '[CRITICAL] RDS 여유 스토리지 10GB 미만. 디스크 고갈 시 DB 중단.',
      metric: rdsFreeStorage,
      threshold: 10 * 1024 * 1024 * 1024, // 10GB in bytes
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    rdsFreeStorageAlarm.addAlarmAction(alarmAction);
    rdsFreeStorageAlarm.addOkAction(alarmAction);

    // [WARNING] RDS 여유 메모리 < 100MB → 메모리 압박
    // GameDay: db.t3.micro 1GB RAM. 100MB 미만 시 swap 발생 가능
    const rdsFreeMemoryAlarm = new cloudwatch.Alarm(this, 'RdsFreeMemoryAlarm', {
      alarmName: 'unicorn-rental-WARNING-rds-free-memory-low',
      alarmDescription: '[WARNING] RDS 여유 메모리 100MB 미만. 메모리 압박으로 성능 저하 가능.',
      metric: rdsFreeMemory,
      threshold: 100 * 1024 * 1024, // 100MB in bytes
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    rdsFreeMemoryAlarm.addAlarmAction(alarmAction);
    rdsFreeMemoryAlarm.addOkAction(alarmAction);

    // [WARNING] DynamoDB 읽기 Throttle → 세션 조회 실패
    // GameDay: PAY_PER_REQUEST이므로 throttle은 드물지만 발생 시 즉시 알람
    const ddReadThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoReadThrottleAlarm', {
      alarmName: 'unicorn-rental-WARNING-dynamodb-read-throttle',
      alarmDescription: '[WARNING] DynamoDB 읽기 Throttle 발생. 세션 조회 실패 가능.',
      metric: ddReadThrottle,
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ddReadThrottleAlarm.addAlarmAction(alarmAction);

    // [WARNING] DynamoDB 쓰기 Throttle → 세션 생성 실패
    const ddWriteThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoWriteThrottleAlarm', {
      alarmName: 'unicorn-rental-WARNING-dynamodb-write-throttle',
      alarmDescription: '[WARNING] DynamoDB 쓰기 Throttle 발생. 세션 생성 실패 가능.',
      metric: ddWriteThrottle,
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ddWriteThrottleAlarm.addAlarmAction(alarmAction);

    // [CRITICAL] DynamoDB 시스템 오류 → AWS 측 장애
    const ddSystemErrorAlarm = new cloudwatch.Alarm(this, 'DynamoSystemErrorAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-dynamodb-system-error',
      alarmDescription: '[CRITICAL] DynamoDB 시스템 오류 발생. AWS 서비스 상태 확인 필요.',
      metric: ddSystemErrors,
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ddSystemErrorAlarm.addAlarmAction(alarmAction);

    // [WARNING] ALB 요청 수 > 300/분 → 트래픽 급증
    const highTrafficAlarm = new cloudwatch.Alarm(this, 'HighTrafficAlarm', {
      alarmName: 'unicorn-rental-WARNING-alb-high-traffic',
      alarmDescription: '[WARNING] ALB 요청 수 300/분 초과. 트래픽 급증 또는 부하 테스트 실행 중.',
      metric: requestCount,
      threshold: 300,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    highTrafficAlarm.addAlarmAction(alarmAction);
    highTrafficAlarm.addOkAction(alarmAction);

    // [CRITICAL] Application Signals - Latency p99 > 3초
    const appSignalsLatencyAlarm = new cloudwatch.Alarm(this, 'AppSignalsLatencyAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-appsignals-latency',
      alarmDescription: '[CRITICAL] Application Signals p99 지연 3초 초과.',
      metric: new cloudwatch.Metric({
        namespace: 'ApplicationSignals',
        metricName: 'Latency',
        dimensionsMap: { Service: 'unicorn-rental-complex', Environment: 'production' },
        statistic: 'p99',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 3000,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    appSignalsLatencyAlarm.addAlarmAction(alarmAction);
    appSignalsLatencyAlarm.addOkAction(alarmAction);

    // [CRITICAL] Application Signals - Fault rate > 5%
    const appSignalsFaultAlarm = new cloudwatch.Alarm(this, 'AppSignalsFaultAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-appsignals-fault',
      alarmDescription: '[CRITICAL] Application Signals Fault 발생.',
      metric: new cloudwatch.Metric({
        namespace: 'ApplicationSignals',
        metricName: 'Fault',
        dimensionsMap: { Service: 'unicorn-rental-complex', Environment: 'production' },
        statistic: 'Sum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    appSignalsFaultAlarm.addAlarmAction(alarmAction);
    appSignalsFaultAlarm.addOkAction(alarmAction);

    // ─── Composite Alarm: 서비스 전체 중단 ──────────────────────────────────
    // Healthy Host 없음 OR 5xx 급증 → 서비스 중단으로 판단
    const serviceDownAlarm = new cloudwatch.CompositeAlarm(this, 'ServiceDownAlarm', {
      compositeAlarmName: 'unicorn-rental-CRITICAL-service-down',
      alarmDescription: '[CRITICAL] 서비스 중단 감지. Healthy Host 없음 또는 5xx 급증.',
      alarmRule: cloudwatch.AlarmRule.anyOf(
        cloudwatch.AlarmRule.fromAlarm(noHealthyHostAlarm, cloudwatch.AlarmState.ALARM),
        cloudwatch.AlarmRule.fromAlarm(target5xxAlarm, cloudwatch.AlarmState.ALARM),
      ),
    });
    serviceDownAlarm.addAlarmAction(alarmAction);
    serviceDownAlarm.addOkAction(alarmAction);

    // ─── ECS 메트릭 ──────────────────────────────────────────────────────────
    const ecsDims = { ClusterName: ECS.clusterName, ServiceName: ECS.serviceName };
    const ecsTgDims = { LoadBalancer: RESOURCES.albDimension, TargetGroup: ECS.tgDimension };

    const ecsRunningCount = new cloudwatch.Metric({
      namespace: 'ECS/ContainerInsights',
      metricName: 'RunningTaskCount',
      dimensionsMap: ecsDims,
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    const ecsCpu = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      dimensionsMap: ecsDims,
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    const ecsMemory = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'MemoryUtilization',
      dimensionsMap: ecsDims,
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    const ecsUnhealthyHost = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'UnHealthyHostCount',
      dimensionsMap: ecsTgDims,
      statistic: 'Maximum',
      period: cdk.Duration.minutes(1),
    });

    const ecsHealthyHost = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HealthyHostCount',
      dimensionsMap: ecsTgDims,
      statistic: 'Minimum',
      period: cdk.Duration.minutes(1),
    });

    const ecsResponseTime = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'TargetResponseTime',
      dimensionsMap: ecsTgDims,
      statistic: 'p99',
      period: cdk.Duration.minutes(1),
    });

    const ecs5xx = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_Target_5XX_Count',
      dimensionsMap: ecsTgDims,
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    // ─── ECS 알람 ─────────────────────────────────────────────────────────────

    // [CRITICAL] Running Task 0 → ECS 서비스 완전 중단
    const ecsNoRunningTaskAlarm = new cloudwatch.Alarm(this, 'EcsNoRunningTaskAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-ecs-no-running-task',
      alarmDescription: '[CRITICAL] ECS Running Task 0. Fargate 서비스 완전 중단.',
      metric: ecsRunningCount,
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    ecsNoRunningTaskAlarm.addAlarmAction(alarmAction);
    ecsNoRunningTaskAlarm.addOkAction(alarmAction);

    // [CRITICAL] ECS Unhealthy Host → 컨테이너 health check 실패
    const ecsUnhealthyAlarm = new cloudwatch.Alarm(this, 'EcsUnhealthyAlarm', {
      alarmName: 'unicorn-rental-CRITICAL-ecs-unhealthy-host',
      alarmDescription: '[CRITICAL] ECS TG Unhealthy 컨테이너 존재.',
      metric: ecsUnhealthyHost,
      threshold: 0,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ecsUnhealthyAlarm.addAlarmAction(alarmAction);
    ecsUnhealthyAlarm.addOkAction(alarmAction);

    // [WARNING] ECS CPU > 80%
    const ecsCpuAlarm = new cloudwatch.Alarm(this, 'EcsCpuAlarm', {
      alarmName: 'unicorn-rental-WARNING-ecs-cpu-high',
      alarmDescription: '[WARNING] ECS 서비스 CPU 80% 초과.',
      metric: ecsCpu,
      threshold: 80,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ecsCpuAlarm.addAlarmAction(alarmAction);
    ecsCpuAlarm.addOkAction(alarmAction);

    // [WARNING] ECS Memory > 80%
    const ecsMemoryAlarm = new cloudwatch.Alarm(this, 'EcsMemoryAlarm', {
      alarmName: 'unicorn-rental-WARNING-ecs-memory-high',
      alarmDescription: '[WARNING] ECS 서비스 메모리 80% 초과.',
      metric: ecsMemory,
      threshold: 80,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ecsMemoryAlarm.addAlarmAction(alarmAction);
    ecsMemoryAlarm.addOkAction(alarmAction);

    // ─── ECS 대시보드 (별도) ──────────────────────────────────────────────────
    const ecsDashboard = new cloudwatch.Dashboard(this, 'EcsDashboard', {
      dashboardName: 'unicorn-rental-complex-ecs',
      defaultInterval: cdk.Duration.hours(3),
    });

    ecsDashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: '🚨 ECS 알람 상태',
        alarms: [ecsNoRunningTaskAlarm, ecsUnhealthyAlarm, ecsCpuAlarm, ecsMemoryAlarm],
        width: 24,
        height: 3,
      }),
    );

    ecsDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ECS - Running / Desired Task Count',
        left: [ecsRunningCount],
        leftAnnotations: [{ value: 2, label: 'Desired', color: '#2ca02c' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ECS TG - Healthy / Unhealthy Host',
        left: [ecsHealthyHost],
        right: [ecsUnhealthyHost],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ECS TG - 응답 시간 p99 (초)',
        left: [ecsResponseTime],
        leftAnnotations: [
          { value: 1, label: 'Warning', color: '#ff7f0e' },
          { value: 3, label: 'Critical', color: '#d62728' },
        ],
        width: 8,
        height: 6,
      }),
    );

    ecsDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ECS - CPU 사용률 (%)',
        left: [ecsCpu],
        leftAnnotations: [{ value: 80, label: 'Warning', color: '#d62728' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ECS - 메모리 사용률 (%)',
        left: [ecsMemory],
        leftAnnotations: [{ value: 80, label: 'Warning', color: '#d62728' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ECS TG - 5xx 오류 수',
        left: [ecs5xx],
        leftAnnotations: [{ value: 10, label: 'Warning', color: '#ff7f0e' }],
        width: 8,
        height: 6,
      }),
    );

    new cdk.CfnOutput(this, 'EcsDashboardUrl', {
      value: `https://${RESOURCES.region}.console.aws.amazon.com/cloudwatch/home?region=${RESOURCES.region}#dashboards:name=unicorn-rental-complex-ecs`,
      description: 'ECS CloudWatch 대시보드 URL',
    });

    // ─── CloudWatch 대시보드 ─────────────────────────────────────────────────
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'unicorn-rental-complex',
      defaultInterval: cdk.Duration.hours(3),
    });

    // 행 1: 서비스 전체 건강도
    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: '🚨 알람 상태',
        alarms: [
          serviceDownAlarm,
          unhealthyHostAlarm,
          noHealthyHostAlarm,
          target5xxAlarm,
          responseTimeAlarm,
          appSignalsLatencyAlarm,
          appSignalsFaultAlarm,
          rdsCpuAlarm,
          rdsConnectionAlarm,
          rdsFreeStorageAlarm,
          highTrafficAlarm,
          ecsNoRunningTaskAlarm,
          ecsUnhealthyAlarm,
          ecsCpuAlarm,
          ecsMemoryAlarm,
        ],
        width: 24,
        height: 4,
      }),
    );

    // 행 2: ALB / Target Group (가용성 + 지연)
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ALB - Healthy / Unhealthy Host Count',
        left: [healthyHostCount],
        right: [unhealthyHostCount],
        leftAnnotations: [{ value: 2, label: 'Desired', color: '#2ca02c' }],
        rightAnnotations: [{ value: 0, label: 'OK', color: '#2ca02c' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ALB - 5xx 오류 수',
        left: [alb5xx, target5xx],
        leftAnnotations: [{ value: 10, label: 'Warning', color: '#ff7f0e' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ALB - 응답 시간 p99 (초)',
        left: [responseTime],
        leftAnnotations: [
          { value: 1, label: 'Warning', color: '#ff7f0e' },
          { value: 3, label: 'Critical', color: '#d62728' },
        ],
        width: 8,
        height: 6,
      }),
    );

    // 행 3: ALB 요청량
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ALB - 요청 수 (1분)',
        left: [requestCount],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'EC2 - 네트워크 In/Out',
        left: [ec2NetworkIn, ec2NetworkOut],
        width: 12,
        height: 6,
      }),
    );

    // 행 4: EC2 / ASG (런타임)
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'EC2 - CPU 사용률 (%)',
        left: [ec2Cpu],
        leftAnnotations: [
          { value: 60, label: 'Scale Out', color: '#ff7f0e' },
          { value: 80, label: 'Warning', color: '#d62728' },
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'EC2 - 현재 CPU (평균)',
        metrics: [ec2Cpu],
        width: 6,
        height: 6,
      }),
      new cloudwatch.AlarmWidget({
        title: 'Unhealthy Host 알람',
        alarm: unhealthyHostAlarm,
        width: 6,
        height: 6,
      }),
    );

    // 행 5: RDS (데이터 저장소)
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'RDS - CPU 사용률 (%)',
        left: [rdsCpu],
        leftAnnotations: [{ value: 80, label: 'Critical', color: '#d62728' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'RDS - 연결 수',
        left: [rdsConnections],
        leftAnnotations: [{ value: 80, label: 'Critical', color: '#d62728' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'RDS - 여유 메모리 (bytes)',
        left: [rdsFreeMemory],
        leftAnnotations: [{ value: 100 * 1024 * 1024, label: '100MB', color: '#ff7f0e' }],
        width: 8,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'RDS - 여유 스토리지 (bytes)',
        left: [rdsFreeStorage],
        leftAnnotations: [{ value: 10 * 1024 * 1024 * 1024, label: '10GB', color: '#d62728' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'RDS - Read/Write 지연 (초)',
        left: [rdsReadLatency, rdsWriteLatency],
        leftAnnotations: [{ value: 0.1, label: '100ms', color: '#ff7f0e' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - Throttle 이벤트',
        left: [ddReadThrottle, ddWriteThrottle],
        right: [ddSystemErrors],
        width: 8,
        height: 6,
      }),
    );

    // 행 6: DynamoDB
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - GetItem 지연 p99 (ms)',
        left: [ddSuccessfulRequests],
        leftAnnotations: [{ value: 50, label: '50ms', color: '#ff7f0e' }],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'App Signals - Latency p99 (ms)',
        left: [new cloudwatch.Metric({
          namespace: 'ApplicationSignals',
          metricName: 'Latency',
          dimensionsMap: { Service: 'unicorn-rental-complex', Environment: 'production' },
          statistic: 'p99',
          period: cdk.Duration.minutes(1),
        })],
        leftAnnotations: [{ value: 1000, label: '1s', color: '#ff7f0e' }, { value: 3000, label: '3s', color: '#d62728' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'App Signals - Error / Fault Rate',
        left: [
          new cloudwatch.Metric({
            namespace: 'ApplicationSignals',
            metricName: 'Error',
            dimensionsMap: { Service: 'unicorn-rental-complex', Environment: 'production' },
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
          }),
          new cloudwatch.Metric({
            namespace: 'ApplicationSignals',
            metricName: 'Fault',
            dimensionsMap: { Service: 'unicorn-rental-complex', Environment: 'production' },
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
          }),
        ],
        width: 8,
        height: 6,
      }),
    );

    // 행 7: ECS (Fargate 서비스)
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ECS - Running Task Count',
        left: [ecsRunningCount],
        leftAnnotations: [{ value: 2, label: 'Desired', color: '#2ca02c' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ECS TG - Healthy / Unhealthy Host',
        left: [ecsHealthyHost],
        right: [ecsUnhealthyHost],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ECS TG - 응답 시간 p99 (초)',
        left: [ecsResponseTime],
        leftAnnotations: [
          { value: 1, label: 'Warning', color: '#ff7f0e' },
          { value: 3, label: 'Critical', color: '#d62728' },
        ],
        width: 8,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ECS - CPU 사용률 (%)',
        left: [ecsCpu],
        leftAnnotations: [{ value: 80, label: 'Warning', color: '#d62728' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ECS - 메모리 사용률 (%)',
        left: [ecsMemory],
        leftAnnotations: [{ value: 80, label: 'Warning', color: '#d62728' }],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ECS TG - 5xx 오류 수',
        left: [ecs5xx],
        leftAnnotations: [{ value: 10, label: 'Warning', color: '#ff7f0e' }],
        width: 8,
        height: 6,
      }),
    );

    // ─── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS 알람 토픽 ARN (Slack 연동 시 사용)',
      exportName: 'unicorn-rental-alarm-topic-arn',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${RESOURCES.region}.console.aws.amazon.com/cloudwatch/home?region=${RESOURCES.region}#dashboards:name=unicorn-rental-complex`,
      description: 'CloudWatch 대시보드 URL',
    });
  }
}
