import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class UnicornRentalInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── 기존 리소스 lookup ────────────────────────────────────
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: 'vpc-03942a987eca4fc09' });

    const alb = elbv2.ApplicationLoadBalancer.fromLookup(this, 'Alb', {
      loadBalancerArn: 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:loadbalancer/app/unicorn-rental-alb/9dce59bbce0f60cb',
    });

    const targetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(this, 'TargetGroup', {
      targetGroupArn: 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:targetgroup/unicorn-rental-tg/889bd0a934f5a509',
    });

    const asg = autoscaling.AutoScalingGroup.fromAutoScalingGroupName(this, 'Asg', 'unicorn-rental-asg');

    const table = dynamodb.Table.fromTableArn(this, 'Table',
      'arn:aws:dynamodb:ap-northeast-2:807876133169:table/unicorn-rental-orders',
    );

    // ── ALB Listener (HTTP:80 → TG) ───────────────────────────
    // 실제 적용: HTTP:80 Listener, weighted_random, anomaly_mitigation ON,
    //            drop_invalid_header_fields ON, deletion_protection ON
    // CDK fromLookup 리소스는 Listener/TG 속성 변경 불가 → CfnResource로 관리
    new cdk.CfnOutput(this, 'AlbDns', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS Name — Listener HTTP:80, weighted_random, anomaly_mitigation ON',
    });

    // ── ASG 설정 현황 (직접 변경됨, CDK 참조용) ───────────────
    // desired: 4, max: 8, DefaultInstanceWarmup: 90s
    // Health Check: interval 10s, threshold 2/2
    new cdk.CfnOutput(this, 'AsgName', {
      value: asg.autoScalingGroupName,
      description: 'ASG — desired:4, max:8, warmup:90s, HC interval:10s threshold:2',
    });

    // ── Quest 2: 알람 / SNS ───────────────────────────────────
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'unicorn-rental-alerts',
      displayName: 'Unicorn Rental Alerts',
    });

    const makeAlarm = (id: string, name: string, desc: string, metric: cloudwatch.Metric, threshold: number, periods: number) => {
      const alarm = new cloudwatch.Alarm(this, id, {
        alarmName: name, alarmDescription: desc, metric, threshold,
        evaluationPeriods: periods,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new actions.SnsAction(alertTopic));
    };

    makeAlarm('RequestCountHighAlarm', 'unicorn-rental-request-count-high', 'ALB 요청 수 급증',
      new cloudwatch.Metric({ namespace: 'AWS/ApplicationELB', metricName: 'RequestCountPerTarget', dimensionsMap: { TargetGroup: 'targetgroup/unicorn-rental-tg/889bd0a934f5a509' }, statistic: 'Sum', period: cdk.Duration.minutes(1) }), 1000, 2);

    makeAlarm('ErrorRateHighAlarm', 'unicorn-rental-5xx-high', '5xx 에러 급증',
      new cloudwatch.Metric({ namespace: 'AWS/ApplicationELB', metricName: 'HTTPCode_Target_5XX_Count', dimensionsMap: { LoadBalancer: 'app/unicorn-rental-alb/9dce59bbce0f60cb' }, statistic: 'Sum', period: cdk.Duration.minutes(1) }), 50, 2);

    makeAlarm('CpuCriticalAlarm', 'unicorn-rental-cpu-critical', 'CPU 80% 초과',
      new cloudwatch.Metric({ namespace: 'AWS/EC2', metricName: 'CPUUtilization', dimensionsMap: { AutoScalingGroupName: 'unicorn-rental-asg' }, statistic: 'Average', period: cdk.Duration.minutes(1) }), 80, 2);

    makeAlarm('UnhealthyHostAlarm', 'unicorn-rental-unhealthy-host', 'Unhealthy 인스턴스 감지',
      new cloudwatch.Metric({ namespace: 'AWS/ApplicationELB', metricName: 'UnHealthyHostCount', dimensionsMap: { LoadBalancer: 'app/unicorn-rental-alb/9dce59bbce0f60cb', TargetGroup: 'targetgroup/unicorn-rental-tg/889bd0a934f5a509' }, statistic: 'Maximum', period: cdk.Duration.minutes(1) }), 0, 1);

    // ── Quest 3: DynamoDB Streams + Lambda ────────────────────
    // DynamoDB: Streams(NEW_AND_OLD_IMAGES), TTL(ttl), PITR(35일),
    //           DeletionProtection — 기존 스택 관리 리소스라 직접 변경 적용됨

    const streamProcessor = new lambda.Function(this, 'StreamProcessor', {
      functionName: 'unicorn-rental-stream-processor',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  for (const record of event.Records) {
    const { eventName, dynamodb: db } = record;
    const newImage = db.NewImage ? JSON.stringify(db.NewImage) : null;
    const oldImage = db.OldImage ? JSON.stringify(db.OldImage) : null;
    console.log(JSON.stringify({ eventName, newImage, oldImage }));
  }
  return { statusCode: 200 };
};
      `),
      timeout: cdk.Duration.seconds(30),
      environment: { TABLE_NAME: 'unicorn-rental-orders' },
    });

    streamProcessor.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetRecords',
        'dynamodb:GetShardIterator',
        'dynamodb:DescribeStream',
        'dynamodb:ListStreams',
      ],
      resources: ['arn:aws:dynamodb:ap-northeast-2:807876133169:table/unicorn-rental-orders/stream/*'],
    }));

    // Event Source Mapping은 CLI로 생성됨 (UUID: 74127d07-e267-48e9-916e-d79a6a010792)
    // Stream ARN: arn:aws:dynamodb:ap-northeast-2:807876133169:table/unicorn-rental-orders/stream/2026-04-05T15:30:19.126

    // ── Outputs ───────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: alertTopic.topicArn,
      description: 'SNS Alert Topic ARN',
    });

    new cdk.CfnOutput(this, 'StreamProcessorArn', {
      value: streamProcessor.functionArn,
      description: 'Stream Processor Lambda ARN',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB — Streams ON, TTL(ttl), PITR 35일, DeletionProtection ON',
    });
  }
}
