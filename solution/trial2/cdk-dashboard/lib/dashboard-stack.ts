import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

const ALB_NAME    = 'app/unicorn-rental-alb/9dce59bbce0f60cb';
const TG_NAME_ECS = 'targetgroup/unicorn-rental-tg-ecs/';  // ECS 신규 TG (prefix)
const ECS_CLUSTER = 'unicorn-rental-cluster';
const ECS_SERVICE = 'unicorn-rental-service';
const DYNAMO_TABLE = 'unicorn-rental-orders';

export class DashboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── ALB 지표 ──────────────────────────────────────────────
    const requestCount = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
      dimensionsMap: { LoadBalancer: ALB_NAME },
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const targetResponseTime = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'TargetResponseTime',
      dimensionsMap: { LoadBalancer: ALB_NAME },
      statistic: 'p99',
      period: cdk.Duration.minutes(1),
    });

    const httpErrors5xx = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_Target_5XX_Count',
      dimensionsMap: { LoadBalancer: ALB_NAME },
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const healthyHostCount = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HealthyHostCount',
      dimensionsMap: { LoadBalancer: ALB_NAME, TargetGroup: TG_NAME_ECS },
      statistic: 'Minimum',
      period: cdk.Duration.minutes(1),
    });

    // ── ECS 지표 ──────────────────────────────────────────────
    const makeEcsMetric = (metricName: string, statistic = 'Average') =>
      new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName,
        dimensionsMap: { ClusterName: ECS_CLUSTER, ServiceName: ECS_SERVICE },
        statistic,
        period: cdk.Duration.minutes(1),
      });

    const ecsCpu    = makeEcsMetric('CPUUtilization');
    const ecsMem    = makeEcsMetric('MemoryUtilization');
    const ecsRunning = new cloudwatch.Metric({
      namespace: 'ECS/ContainerInsights',
      metricName: 'RunningTaskCount',
      dimensionsMap: { ClusterName: ECS_CLUSTER, ServiceName: ECS_SERVICE },
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });
    const ecsDesired = new cloudwatch.Metric({
      namespace: 'ECS/ContainerInsights',
      metricName: 'DesiredTaskCount',
      dimensionsMap: { ClusterName: ECS_CLUSTER, ServiceName: ECS_SERVICE },
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    // ── DynamoDB 지표 ─────────────────────────────────────────
    const dynamoRead = new cloudwatch.Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'ConsumedReadCapacityUnits',
      dimensionsMap: { TableName: DYNAMO_TABLE },
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const dynamoWrite = new cloudwatch.Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'ConsumedWriteCapacityUnits',
      dimensionsMap: { TableName: DYNAMO_TABLE },
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const dynamoErrors = new cloudwatch.Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'SystemErrors',
      dimensionsMap: { TableName: DYNAMO_TABLE },
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    // ── CloudWatch 알람 ───────────────────────────────────────
    const alertTopic = sns.Topic.fromTopicArn(this, 'AlertTopic',
      'arn:aws:sns:ap-northeast-2:807876133169:unicorn-rental-alerts');

    new cloudwatch.Alarm(this, 'EcsCpuAlarm', {
      alarmName: 'unicorn-rental-ecs-cpu-high',
      alarmDescription: 'ECS CPU 80% 초과',
      metric: ecsCpu,
      threshold: 80,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({ bind: () => ({ alarmActionArn: alertTopic.topicArn }) });

    new cloudwatch.Alarm(this, 'EcsMemAlarm', {
      alarmName: 'unicorn-rental-ecs-memory-high',
      alarmDescription: 'ECS Memory 80% 초과',
      metric: ecsMem,
      threshold: 80,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({ bind: () => ({ alarmActionArn: alertTopic.topicArn }) });

    new cloudwatch.Alarm(this, 'EcsTaskCountAlarm', {
      alarmName: 'unicorn-rental-ecs-task-low',
      alarmDescription: 'ECS RunningTaskCount < DesiredTaskCount',
      metric: ecsRunning,
      threshold: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    }).addAlarmAction({ bind: () => ({ alarmActionArn: alertTopic.topicArn }) });

    // ── 대시보드 조립 ─────────────────────────────────────────
    new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'UnicornRental-Workload',
      widgets: [
        // Row 1: ALB 개요
        [new cloudwatch.TextWidget({ markdown: '## ALB', width: 24, height: 1 })],
        [
          new cloudwatch.GraphWidget({ title: 'Request Count',       left: [requestCount],       width: 8 }),
          new cloudwatch.GraphWidget({ title: 'Response Time p99',   left: [targetResponseTime], width: 8 }),
          new cloudwatch.GraphWidget({ title: '5xx Errors',          left: [httpErrors5xx],      width: 8 }),
        ],
        [
          new cloudwatch.GraphWidget({ title: 'Healthy Host Count (ECS TG)', left: [healthyHostCount], width: 8 }),
        ],
        // Row 2: ECS
        [new cloudwatch.TextWidget({ markdown: '## ECS — unicorn-rental-service', width: 24, height: 1 })],
        [
          new cloudwatch.GraphWidget({ title: 'CPU Utilization',    left: [ecsCpu],     width: 8 }),
          new cloudwatch.GraphWidget({ title: 'Memory Utilization', left: [ecsMem],     width: 8 }),
          new cloudwatch.GraphWidget({ title: 'Task Count (Running / Desired)', left: [ecsRunning], right: [ecsDesired], width: 8 }),
        ],
        // Row 3: DynamoDB
        [new cloudwatch.TextWidget({ markdown: '## DynamoDB — unicorn-rental-orders', width: 24, height: 1 })],
        [
          new cloudwatch.GraphWidget({ title: 'Read Capacity',  left: [dynamoRead],    width: 8 }),
          new cloudwatch.GraphWidget({ title: 'Write Capacity', left: [dynamoWrite],   width: 8 }),
          new cloudwatch.GraphWidget({ title: 'System Errors',  left: [dynamoErrors],  width: 8 }),
        ],
      ],
    });
  }
}
