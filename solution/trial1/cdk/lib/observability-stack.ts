import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export class UnicornRentalObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, 'Alb', {
      loadBalancerArn: 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:loadbalancer/app/unicorn-rental-alb/c6a98aeb76442a63',
      securityGroupId: 'sg-0e108bceb13a91599',
    });

    const albDim = { LoadBalancer: 'app/unicorn-rental-alb/c6a98aeb76442a63' };
    const ecsTgDim = { ...albDim, TargetGroup: 'targetgroup/unicorn-rental-ecs-tg/3d56334d2f0a5cdc' };
    const ecsDim = { ClusterName: 'unicorn-rental', ServiceName: 'unicorn-rental' };
    const dynamoDim = { TableName: 'unicorn-rental-orders' };

    const m = (namespace: string, metricName: string, dimensionsMap: Record<string, string>, statistic = 'Sum', period = 60) =>
      new cloudwatch.Metric({ namespace, metricName, dimensionsMap, statistic, period: cdk.Duration.seconds(period) });

    new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'unicorn-rental',
      defaultInterval: cdk.Duration.hours(3),
      widgets: [
        // Row 1: Traffic
        [
          new cloudwatch.GraphWidget({
            title: 'Request Count (1m)',
            left: [m('AWS/ApplicationELB', 'RequestCount', albDim)],
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: 'Response Time p99 / p50 (1m)',
            left: [m('AWS/ApplicationELB', 'TargetResponseTime', albDim, 'p99')],
            right: [m('AWS/ApplicationELB', 'TargetResponseTime', albDim, 'p50')],
            leftYAxis: { label: 'seconds' },
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: 'HTTP 2xx / 5xx / 4xx (1m)',
            left: [
              m('AWS/ApplicationELB', 'HTTPCode_Target_2XX_Count', albDim),
              m('AWS/ApplicationELB', 'HTTPCode_Target_5XX_Count', albDim),
            ],
            right: [m('AWS/ApplicationELB', 'HTTPCode_Target_4XX_Count', albDim)],
            width: 8,
          }),
        ],
        // Row 2: ECS Health
        [
          new cloudwatch.GraphWidget({
            title: 'ECS Running / Failed Tasks',
            left: [m('ECS/ContainerInsights', 'RunningTaskCount', ecsDim, 'Average')],
            right: [m('ECS/ContainerInsights', 'FailedTaskCount', ecsDim, 'Sum')],
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: 'ECS CPU / Memory Utilization (avg)',
            left: [m('AWS/ECS', 'CPUUtilization', ecsDim, 'Average')],
            right: [m('AWS/ECS', 'MemoryUtilization', ecsDim, 'Average')],
            leftYAxis: { min: 0, max: 100, label: '%' },
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: 'ECS TG Healthy / Unhealthy',
            left: [m('AWS/ApplicationELB', 'HealthyHostCount', ecsTgDim, 'Minimum')],
            right: [m('AWS/ApplicationELB', 'UnHealthyHostCount', ecsTgDim, 'Maximum')],
            width: 8,
          }),
        ],
        // Row 3: DynamoDB
        [
          new cloudwatch.GraphWidget({
            title: 'DynamoDB Read / Write Capacity (1m)',
            left: [m('AWS/DynamoDB', 'ConsumedReadCapacityUnits', dynamoDim)],
            right: [m('AWS/DynamoDB', 'ConsumedWriteCapacityUnits', dynamoDim)],
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: 'DynamoDB Latency (avg)',
            left: [
              m('AWS/DynamoDB', 'SuccessfulRequestLatency', { ...dynamoDim, Operation: 'GetItem' }, 'Average'),
              m('AWS/DynamoDB', 'SuccessfulRequestLatency', { ...dynamoDim, Operation: 'PutItem' }, 'Average'),
              m('AWS/DynamoDB', 'SuccessfulRequestLatency', { ...dynamoDim, Operation: 'Query' }, 'Average'),
            ],
            leftYAxis: { label: 'ms' },
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: 'DynamoDB Errors / Throttles (1m)',
            left: [
              m('AWS/DynamoDB', 'SystemErrors', dynamoDim),
              m('AWS/DynamoDB', 'UserErrors', dynamoDim),
            ],
            right: [m('AWS/DynamoDB', 'ThrottledRequests', dynamoDim)],
            width: 8,
          }),
        ],
      ],
    });
  }
}
