import * as cdk from 'aws-cdk-lib';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { BootstrapApplicationResources, BootstrapNetworkResources, BootstrapSettings } from './types';
import { createBootstrapUserData } from './user-data';

export function createBootstrapApplication(
  scope: cdk.Stack,
  settings: BootstrapSettings,
  network: BootstrapNetworkResources,
): BootstrapApplicationResources {
  const table = new dynamodb.Table(scope, 'RentalTable', {
    tableName: `${settings.projectName}-orders`,
    partitionKey: {
      name: 'pk',
      type: dynamodb.AttributeType.STRING,
    },
    sortKey: {
      name: 'sk',
      type: dynamodb.AttributeType.STRING,
    },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    pointInTimeRecoverySpecification: {
      pointInTimeRecoveryEnabled: true,
    },
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const instanceRole = new iam.Role(scope, 'BootstrapInstanceRole', {
    roleName: `${settings.projectName}-ec2-role`,
    assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
    ],
  });
  table.grantReadWriteData(instanceRole);

  const keyPair = new ec2.KeyPair(scope, 'ApplicationSshKeyPair', {
    keyPairName: `${settings.projectName}-ssh`,
  });

  const appDirectory = `/opt/${settings.projectName}/app`;
  const serviceName = settings.projectName;
  const userData = createBootstrapUserData({
    appDirectory,
    awsRegion: scope.region,
    projectName: settings.projectName,
    serviceName,
    tableName: table.tableName,
  });

  const asg = new autoscaling.AutoScalingGroup(scope, 'ApplicationAsg', {
    vpc: network.vpc,
    autoScalingGroupName: `${settings.projectName}-asg`,
    instanceType: new ec2.InstanceType(settings.instanceType),
    machineImage: ec2.MachineImage.latestAmazonLinux2023(),
    minCapacity: settings.minCapacity,
    maxCapacity: settings.maxCapacity,
    desiredCapacity: settings.desiredCapacity,
    vpcSubnets: {
      subnetType: ec2.SubnetType.PUBLIC,
    },
    associatePublicIpAddress: true,
    keyName: keyPair.keyPairName,
    role: instanceRole,
    userData,
    healthChecks: autoscaling.HealthChecks.withAdditionalChecks({
      additionalTypes: [autoscaling.AdditionalHealthCheckType.ELB],
      gracePeriod: cdk.Duration.minutes(5),
    }),
    securityGroup: network.appSecurityGroup,
  });

  asg.scaleOnCpuUtilization('CpuScaling', {
    targetUtilizationPercent: 60,
    estimatedInstanceWarmup: cdk.Duration.minutes(3),
  });

  const loadBalancer = new elbv2.ApplicationLoadBalancer(scope, 'LoadBalancer', {
    vpc: network.vpc,
    loadBalancerName: `${settings.projectName}-alb`,
    internetFacing: true,
    securityGroup: network.albSecurityGroup,
  });

  const targetGroup = new elbv2.ApplicationTargetGroup(scope, 'TargetGroup', {
    vpc: network.vpc,
    targetGroupName: `${settings.projectName}-tg`,
    protocol: elbv2.ApplicationProtocol.HTTP,
    port: 8080,
    targetType: elbv2.TargetType.INSTANCE,
    healthCheck: {
      path: settings.healthCheckPath,
      healthyHttpCodes: '200-399',
      interval: cdk.Duration.seconds(30),
    },
  });

  asg.attachToApplicationTargetGroup(targetGroup);

  loadBalancer.addListener('HttpListener', {
    port: 80,
    protocol: elbv2.ApplicationProtocol.HTTP,
    defaultTargetGroups: [targetGroup],
    open: true,
  });

  return {
    table,
    instanceRole,
    asg,
    loadBalancer,
    targetGroup,
    keyPair,
  };
}
