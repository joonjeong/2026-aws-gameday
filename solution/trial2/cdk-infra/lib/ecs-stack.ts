import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

const ECR_IMAGE = '807876133169.dkr.ecr.ap-northeast-2.amazonaws.com/unicorn-rental:latest';
const VPC_ID = 'vpc-03942a987eca4fc09';
const ALB_ARN = 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:loadbalancer/app/unicorn-rental-alb/9dce59bbce0f60cb';
const LISTENER_ARN = 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:listener/app/unicorn-rental-alb/9dce59bbce0f60cb/0c4f59a8ffcc58af';
const PRIVATE_SUBNET_1 = 'subnet-04a59955a270de443';
const PRIVATE_SUBNET_2 = 'subnet-0a935a75140b0445a';
const ALB_SG = 'sg-0126d5e3c80c54844';

export class UnicornRentalEcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: VPC_ID });

    // ── ECS용 Security Group ──────────────────────────────────
    const ecsSg = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc,
      securityGroupName: 'unicorn-rental-ecs-sg',
      description: 'ECS tasks - allow ALB on 8080',
    });
    ecsSg.addIngressRule(
      ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbSg', ALB_SG),
      ec2.Port.tcp(8080),
      'Allow ALB',
    );

    // ── ECS Cluster ───────────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'unicorn-rental-cluster',
      vpc,
    });

    // ── Task Role (DynamoDB 접근) ─────────────────────────────
    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: 'unicorn-rental-ecs-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        dynamo: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
              'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan'],
            resources: ['arn:aws:dynamodb:ap-northeast-2:807876133169:table/unicorn-rental-orders'],
          })],
        }),
      },
    });

    // ── Task Definition ───────────────────────────────────────
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      family: 'unicorn-rental',
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole,
    });

    taskDef.addContainer('app', {
      image: ecs.ContainerImage.fromRegistry(ECR_IMAGE),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        PORT: '8080',
        AWS_REGION: 'ap-northeast-2',
        AWS_DEFAULT_REGION: 'ap-northeast-2',
        TABLE_NAME: 'unicorn-rental-orders',
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'unicorn-rental' }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/actuator/health || exit 1'],
        interval: cdk.Duration.seconds(10),
        timeout: cdk.Duration.seconds(5),
        retries: 2,
        startPeriod: cdk.Duration.seconds(30),
      },
    });

    // ── ECS Target Group (신규) ───────────────────────────────
    const ecsTg = new elbv2.ApplicationTargetGroup(this, 'EcsTg', {
      targetGroupName: 'unicorn-rental-tg-ecs',
      vpc,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/actuator/health',
        interval: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
      },
    });

    // ECS TG를 ALB Listener에 가중치 0으로 연결 (트래픽 전환 전 준비)
    const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, 'Listener', {
      listenerArn: LISTENER_ARN,
      securityGroup: ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbSgRef', ALB_SG),
    });

    const ec2Tg = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(this, 'Ec2Tg', {
      targetGroupArn: 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:targetgroup/unicorn-rental-tg/889bd0a934f5a509',
    });

    // 기존 default action을 weighted forward로 교체 (EC2: 100, ECS: 0)
    new elbv2.CfnListenerRule(this, 'WeightedRule', {
      listenerArn: LISTENER_ARN,
      priority: 1,
      conditions: [{ field: 'path-pattern', values: ['/*'] }],
      actions: [{
        type: 'forward',
        forwardConfig: {
          targetGroups: [
            { targetGroupArn: ec2Tg.targetGroupArn, weight: 100 },
            { targetGroupArn: ecsTg.targetGroupArn, weight: 0 },
          ],
        },
      }],
    });

    // ── ECS Service ───────────────────────────────────────────
    const service = new ecs.FargateService(this, 'Service', {
      serviceName: 'unicorn-rental-service',
      cluster,
      taskDefinition: taskDef,
      desiredCount: 2,
      vpcSubnets: {
        subnets: [
          ec2.Subnet.fromSubnetId(this, 'PrivSub1', PRIVATE_SUBNET_1),
          ec2.Subnet.fromSubnetId(this, 'PrivSub2', PRIVATE_SUBNET_2),
        ],
      },
      securityGroups: [ecsSg],
      assignPublicIp: false,
    });

    service.attachToApplicationTargetGroup(ecsTg);

    // ── Outputs ───────────────────────────────────────────────
    new cdk.CfnOutput(this, 'EcsTgArn', {
      value: ecsTg.targetGroupArn,
      description: 'ECS Target Group ARN — 트래픽 전환 시 사용',
      exportName: 'UnicornRentalEcsStack:EcsTgArn',
    });

    new cdk.CfnOutput(this, 'ListenerArn', {
      value: LISTENER_ARN,
      description: 'ALB Listener ARN — 가중치 전환 시 사용',
    });

    new cdk.CfnOutput(this, 'Ec2TgArn', {
      value: 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:targetgroup/unicorn-rental-tg/889bd0a934f5a509',
      description: 'EC2 Target Group ARN — 가중치 전환 시 사용',
    });
  }
}
