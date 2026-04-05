import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

const ASG_NAME = 'unicorn-rental-asg';
const ALB_NAME = 'app/unicorn-rental-alb/9dce59bbce0f60cb';
const TG_NAME  = 'targetgroup/unicorn-rental-tg/889bd0a934f5a509';
const INSTANCE_IDS = ['i-01a1498147a8a1c61', 'i-0f6f527fd55e8a62e'];
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
      dimensionsMap: { LoadBalancer: ALB_NAME, TargetGroup: TG_NAME },
      statistic: 'Minimum',
      period: cdk.Duration.minutes(1),
    });

    // ── EC2 / ASG 지표 ────────────────────────────────────────
    const makeEc2Metric = (instanceId: string, metricName: string) =>
      new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName,
        dimensionsMap: { InstanceId: instanceId },
        statistic: 'Average',
        period: cdk.Duration.minutes(1),
      });

    const cpuWidgets = INSTANCE_IDS.map(
      (id) =>
        new cloudwatch.GraphWidget({
          title: `CPU — ${id}`,
          left: [makeEc2Metric(id, 'CPUUtilization')],
          width: 12,
        })
    );

    const networkWidgets = INSTANCE_IDS.map(
      (id) =>
        new cloudwatch.GraphWidget({
          title: `Network — ${id}`,
          left: [makeEc2Metric(id, 'NetworkIn')],
          right: [makeEc2Metric(id, 'NetworkOut')],
          width: 12,
        })
    );

    // ── ASG 지표 ──────────────────────────────────────────────
    const asgInService = new cloudwatch.Metric({
      namespace: 'AWS/AutoScaling',
      metricName: 'GroupInServiceInstances',
      dimensionsMap: { AutoScalingGroupName: ASG_NAME },
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

    // ── 대시보드 조립 ─────────────────────────────────────────
    new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'UnicornRental-Workload',
      widgets: [
        // Row 1: ALB 개요
        [
          new cloudwatch.TextWidget({ markdown: '## ALB', width: 24, height: 1 }),
        ],
        [
          new cloudwatch.GraphWidget({ title: 'Request Count', left: [requestCount], width: 8 }),
          new cloudwatch.GraphWidget({ title: 'Response Time p99', left: [targetResponseTime], width: 8 }),
          new cloudwatch.GraphWidget({ title: '5xx Errors', left: [httpErrors5xx], width: 8 }),
        ],
        [
          new cloudwatch.GraphWidget({ title: 'Healthy Host Count', left: [healthyHostCount], width: 8 }),
          new cloudwatch.GraphWidget({ title: 'ASG InService Instances', left: [asgInService], width: 8 }),
        ],
        // Row 2: EC2 CPU
        [
          new cloudwatch.TextWidget({ markdown: '## EC2 CPU', width: 24, height: 1 }),
        ],
        cpuWidgets,
        // Row 3: EC2 Network
        [
          new cloudwatch.TextWidget({ markdown: '## EC2 Network', width: 24, height: 1 }),
        ],
        networkWidgets,
        // Row 4: DynamoDB
        [
          new cloudwatch.TextWidget({ markdown: '## DynamoDB — unicorn-rental-orders', width: 24, height: 1 }),
        ],
        [
          new cloudwatch.GraphWidget({ title: 'Read Capacity', left: [dynamoRead], width: 8 }),
          new cloudwatch.GraphWidget({ title: 'Write Capacity', left: [dynamoWrite], width: 8 }),
          new cloudwatch.GraphWidget({ title: 'System Errors', left: [dynamoErrors], width: 8 }),
        ],
      ],
    });
  }
}
