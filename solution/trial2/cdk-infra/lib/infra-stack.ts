import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * 기존 UnicornRentalApplicationStack 리소스를 참조하는 CDK 스택.
 * 리소스를 직접 생성하지 않고 fromXxx() lookup으로 참조하여
 * 확장성/운영 개선 작업의 기반으로 사용한다.
 */
export class UnicornRentalInfraStack extends cdk.Stack {
  // 외부에서 참조할 수 있도록 public으로 노출
  public readonly vpc: ec2.IVpc;
  public readonly alb: elbv2.IApplicationLoadBalancer;
  public readonly targetGroup: elbv2.IApplicationTargetGroup;
  public readonly asg: autoscaling.IAutoScalingGroup;
  public readonly table: dynamodb.ITable;
  public readonly instanceRole: iam.IRole;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── VPC lookup ────────────────────────────────────────────
    this.vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: 'vpc-03942a987eca4fc09',
    });

    // ── ALB lookup ────────────────────────────────────────────
    this.alb = elbv2.ApplicationLoadBalancer.fromLookup(this, 'Alb', {
      loadBalancerArn: 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:loadbalancer/app/unicorn-rental-alb/9dce59bbce0f60cb',
    });

    // ── Target Group lookup ───────────────────────────────────
    this.targetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(this, 'TargetGroup', {
      targetGroupArn: 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:targetgroup/unicorn-rental-tg/889bd0a934f5a509',
    });

    // ── ASG lookup ────────────────────────────────────────────
    this.asg = autoscaling.AutoScalingGroup.fromAutoScalingGroupName(this, 'Asg', 'unicorn-rental-asg');

    // ── DynamoDB lookup ───────────────────────────────────────
    this.table = dynamodb.Table.fromTableArn(this, 'Table',
      'arn:aws:dynamodb:ap-northeast-2:807876133169:table/unicorn-rental-orders',
    );

    // ── IAM Role lookup ───────────────────────────────────────
    this.instanceRole = iam.Role.fromRoleName(this, 'InstanceRole', 'unicorn-rental-ec2-role');

    // ── Stack Outputs (참조용) ────────────────────────────────
    new cdk.CfnOutput(this, 'AlbDns', {
      value: this.alb.loadBalancerDnsName,
      description: 'ALB DNS Name',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB Table Name',
    });
  }
}
