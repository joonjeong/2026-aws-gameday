import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

const VPC_ID = 'vpc-03942a987eca4fc09';
const PRIVATE_SUBNET_A = 'subnet-07fc7fe68ba71c3c2';
const PRIVATE_SUBNET_B = 'subnet-0f41b0666830014d9';
const ALB_SG_ID = 'sg-0e108bceb13a91599';
const ALB_LISTENER_ARN = 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:listener/app/unicorn-rental-alb/c6a98aeb76442a63/3136cd11a671c0bf';
const EC2_TG_ARN = 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:targetgroup/unicorn-rental-tg/92f84dff3e7fb72c';
const IMAGE_URI = '807876133169.dkr.ecr.ap-northeast-2.amazonaws.com/unicorn-rental:latest';
const DYNAMODB_TABLE_ARN = 'arn:aws:dynamodb:ap-northeast-2:807876133169:table/unicorn-rental-orders';

export class UnicornRentalFargateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: VPC_ID,
      availabilityZones: ['ap-northeast-2a', 'ap-northeast-2b'],
      privateSubnetIds: [PRIVATE_SUBNET_A, PRIVATE_SUBNET_B],
    });

    // Task Role — DynamoDB access
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: 'unicorn-rental-ecs-task-role',
    });
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
        'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan',
        'dynamodb:DescribeTable',
      ],
      resources: [DYNAMODB_TABLE_ARN],
    }));

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'unicorn-rental',
      vpc,
    });

    // Execution Role — ECR pull + CloudWatch Logs
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: 'unicorn-rental-ecs-execution-role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Task Definition
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      family: 'unicorn-rental',
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole,
      executionRole,
    });

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/unicorn-rental',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    taskDef.addContainer('app', {
      image: ecs.ContainerImage.fromRegistry(IMAGE_URI),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        PORT: '8080',
        AWS_REGION: 'ap-northeast-2',
        AWS_DEFAULT_REGION: 'ap-northeast-2',
        TABLE_NAME: 'unicorn-rental-orders',
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'ecs',
        logGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/actuator/health || exit 1'],
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        retries: 2,
        startPeriod: cdk.Duration.seconds(30),
      },
    });

    // Fargate SG — only ALB SG can reach 8080
    const fargatesg = new ec2.SecurityGroup(this, 'FargateSg', {
      vpc,
      securityGroupName: 'unicorn-rental-fargate-sg',
      description: 'Fargate tasks - allow ALB on 8080',
      allowAllOutbound: true,
    });
    fargatesg.addIngressRule(
      ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbSg', ALB_SG_ID),
      ec2.Port.tcp(8080),
    );

    // New ip-type Target Group for Fargate
    const ecsTg = new elbv2.ApplicationTargetGroup(this, 'EcsTg', {
      targetGroupName: 'unicorn-rental-ecs-tg',
      vpc,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/actuator/health',
        interval: cdk.Duration.seconds(15),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
      },
    });

    // ECS Service
    const service = new ecs.FargateService(this, 'Service', {
      serviceName: 'unicorn-rental',
      cluster,
      taskDefinition: taskDef,
      desiredCount: 2,
      vpcSubnets: { subnets: [
        ec2.Subnet.fromSubnetId(this, 'PrivA', PRIVATE_SUBNET_A),
        ec2.Subnet.fromSubnetId(this, 'PrivB', PRIVATE_SUBNET_B),
      ]},
      securityGroups: [fargatesg],
      assignPublicIp: false,
      circuitBreaker: { rollback: true },
    });
    service.attachToApplicationTargetGroup(ecsTg);

    // Update ALB listener: weighted forward EC2(100) + ECS(0) — shift weight to migrate
    const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, 'Listener', {
      listenerArn: ALB_LISTENER_ARN,
      securityGroup: ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbSgRef', ALB_SG_ID),
    });

    new elbv2.ApplicationListenerRule(this, 'WeightedRule', {
      listener,
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/*'])],
      action: elbv2.ListenerAction.weightedForward([
        { targetGroup: elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(this, 'Ec2Tg', {
            targetGroupArn: EC2_TG_ARN,
          }),
          weight: 0,
        },
        { targetGroup: ecsTg, weight: 100 },
      ]),
    });

    new cdk.CfnOutput(this, 'EcsTgArn', { value: ecsTg.targetGroupArn });
    new cdk.CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
  }
}
