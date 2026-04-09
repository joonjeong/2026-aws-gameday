const cdk = require('aws-cdk-lib');
const cloudwatch = require('aws-cdk-lib/aws-cloudwatch');

const DEFAULT_PERIOD = cdk.Duration.minutes(5);

function buildSearchMetric({ namespace, dimensions, metricName, stat, period = DEFAULT_PERIOD }) {
  const search = `{${[namespace, ...dimensions].join(',')}} MetricName="${metricName}"`;

  // SEARCH keeps the dashboard unpinned so it renders every matching resource in the account/region.
  // An empty label preserves the individual metric label in the legend so each resource stays identifiable.
  return new cloudwatch.MathExpression({
    expression: `SEARCH('${search}', '${stat}', ${period.toSeconds()})`,
    label: '',
    period,
  });
}

function createSection(title, description) {
  return new cloudwatch.TextWidget({
    markdown: `## ${title}\n${description}`,
    width: 24,
    height: 3,
  });
}

class UnicornRentalMonitorStack extends cdk.Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const dashboard = new cloudwatch.Dashboard(this, 'Task0Dashboard', {
      dashboardName: props.dashboardName ?? 'unicorn-rental-task0-overview',
      defaultInterval: DEFAULT_PERIOD,
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: [
          '# Unicorn Rental Task 0 Monitoring Baseline',
          '',
          '- This dashboard is defined before resource discovery is complete.',
          '- Layer order is fixed: ALB -> EC2 -> ECS -> DynamoDB -> RDS.',
          '- Widgets intentionally use CloudWatch SEARCH expressions and do not pin to a single named resource.',
          '- Empty graphs are acceptable placeholders until matching metrics exist.',
        ].join('\n'),
        width: 24,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      createSection('ALB', 'Show all ALB resources without filtering by a specific load balancer name.'),
      new cloudwatch.GraphWidget({
        title: 'ALB Traffic and Host Health',
        width: 12,
        height: 8,
        left: [
          buildSearchMetric({
            namespace: 'AWS/ApplicationELB',
            dimensions: ['LoadBalancer'],
            metricName: 'RequestCount',
            stat: 'Sum',
          }),
          buildSearchMetric({
            namespace: 'AWS/ApplicationELB',
            dimensions: ['LoadBalancer'],
            metricName: 'HealthyHostCount',
            stat: 'Average',
          }),
          buildSearchMetric({
            namespace: 'AWS/ApplicationELB',
            dimensions: ['LoadBalancer'],
            metricName: 'UnHealthyHostCount',
            stat: 'Average',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'ALB Errors and Latency',
        width: 12,
        height: 8,
        left: [
          buildSearchMetric({
            namespace: 'AWS/ApplicationELB',
            dimensions: ['LoadBalancer'],
            metricName: 'HTTPCode_ELB_5XX_Count',
            stat: 'Sum',
          }),
          buildSearchMetric({
            namespace: 'AWS/ApplicationELB',
            dimensions: ['LoadBalancer'],
            metricName: 'HTTPCode_Target_5XX_Count',
            stat: 'Sum',
          }),
          buildSearchMetric({
            namespace: 'AWS/ApplicationELB',
            dimensions: ['LoadBalancer'],
            metricName: 'TargetResponseTime',
            stat: 'Average',
          }),
        ],
      }),
    );

    dashboard.addWidgets(
      createSection('EC2', 'Show all application EC2 instances without filtering by a specific instance ID.'),
      new cloudwatch.GraphWidget({
        title: 'EC2 Availability and CPU',
        width: 12,
        height: 8,
        left: [
          buildSearchMetric({
            namespace: 'AWS/EC2',
            dimensions: ['InstanceId'],
            metricName: 'CPUUtilization',
            stat: 'Average',
          }),
          buildSearchMetric({
            namespace: 'AWS/EC2',
            dimensions: ['InstanceId'],
            metricName: 'StatusCheckFailed',
            stat: 'Sum',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'EC2 Network Throughput',
        width: 12,
        height: 8,
        left: [
          buildSearchMetric({
            namespace: 'AWS/EC2',
            dimensions: ['InstanceId'],
            metricName: 'NetworkIn',
            stat: 'Sum',
          }),
          buildSearchMetric({
            namespace: 'AWS/EC2',
            dimensions: ['InstanceId'],
            metricName: 'NetworkOut',
            stat: 'Sum',
          }),
        ],
      }),
    );

    dashboard.addWidgets(
      createSection('ECS', 'Keep the ECS layer visible even when the current environment has no ECS services yet.'),
      new cloudwatch.GraphWidget({
        title: 'ECS Service Utilization',
        width: 12,
        height: 8,
        left: [
          buildSearchMetric({
            namespace: 'AWS/ECS',
            dimensions: ['ClusterName', 'ServiceName'],
            metricName: 'CPUUtilization',
            stat: 'Average',
          }),
          buildSearchMetric({
            namespace: 'AWS/ECS',
            dimensions: ['ClusterName', 'ServiceName'],
            metricName: 'MemoryUtilization',
            stat: 'Average',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'ECS Task Health Placeholder',
        width: 12,
        height: 8,
        left: [
          buildSearchMetric({
            namespace: 'ECS/ContainerInsights',
            dimensions: ['ClusterName', 'ServiceName'],
            metricName: 'RunningTaskCount',
            stat: 'Average',
          }),
          buildSearchMetric({
            namespace: 'ECS/ContainerInsights',
            dimensions: ['ClusterName', 'ServiceName'],
            metricName: 'PendingTaskCount',
            stat: 'Average',
          }),
        ],
      }),
    );

    dashboard.addWidgets(
      createSection('DynamoDB', 'Show all tables without filtering by a specific table name.'),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Errors and Latency',
        width: 12,
        height: 8,
        left: [
          buildSearchMetric({
            namespace: 'AWS/DynamoDB',
            dimensions: ['TableName'],
            metricName: 'SuccessfulRequestLatency',
            stat: 'Average',
          }),
          buildSearchMetric({
            namespace: 'AWS/DynamoDB',
            dimensions: ['TableName'],
            metricName: 'SystemErrors',
            stat: 'Sum',
          }),
          buildSearchMetric({
            namespace: 'AWS/DynamoDB',
            dimensions: ['TableName'],
            metricName: 'ThrottledRequests',
            stat: 'Sum',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Capacity Consumption',
        width: 12,
        height: 8,
        left: [
          buildSearchMetric({
            namespace: 'AWS/DynamoDB',
            dimensions: ['TableName'],
            metricName: 'ConsumedReadCapacityUnits',
            stat: 'Sum',
          }),
          buildSearchMetric({
            namespace: 'AWS/DynamoDB',
            dimensions: ['TableName'],
            metricName: 'ConsumedWriteCapacityUnits',
            stat: 'Sum',
          }),
        ],
      }),
    );

    dashboard.addWidgets(
      createSection('RDS', 'Show all database instances without filtering by a specific DB identifier.'),
      new cloudwatch.GraphWidget({
        title: 'RDS Capacity and Connections',
        width: 12,
        height: 8,
        left: [
          buildSearchMetric({
            namespace: 'AWS/RDS',
            dimensions: ['DBInstanceIdentifier'],
            metricName: 'CPUUtilization',
            stat: 'Average',
          }),
          buildSearchMetric({
            namespace: 'AWS/RDS',
            dimensions: ['DBInstanceIdentifier'],
            metricName: 'DatabaseConnections',
            stat: 'Average',
          }),
          buildSearchMetric({
            namespace: 'AWS/RDS',
            dimensions: ['DBInstanceIdentifier'],
            metricName: 'FreeableMemory',
            stat: 'Minimum',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'RDS Storage and Latency',
        width: 12,
        height: 8,
        left: [
          buildSearchMetric({
            namespace: 'AWS/RDS',
            dimensions: ['DBInstanceIdentifier'],
            metricName: 'FreeStorageSpace',
            stat: 'Minimum',
          }),
          buildSearchMetric({
            namespace: 'AWS/RDS',
            dimensions: ['DBInstanceIdentifier'],
            metricName: 'ReadLatency',
            stat: 'Average',
          }),
          buildSearchMetric({
            namespace: 'AWS/RDS',
            dimensions: ['DBInstanceIdentifier'],
            metricName: 'WriteLatency',
            stat: 'Average',
          }),
        ],
      }),
    );

    new cdk.CfnOutput(this, 'DashboardName', {
      value: dashboard.dashboardName,
    });
  }
}

module.exports = {
  UnicornRentalMonitorStack,
};
