import * as cdk from 'aws-cdk-lib';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { buildResourceName } from './settings';
import { BootstrapApplicationResources, BootstrapNetworkResources, BootstrapSettings } from './types';
import { createBootstrapUserData } from './user-data';

export function createBootstrapApplication(
  scope: cdk.Stack,
  settings: BootstrapSettings,
  network: BootstrapNetworkResources,
): BootstrapApplicationResources {
  const tableName = buildResourceName(settings, `${settings.projectName}-orders`);
  const albSecurityGroupName = buildResourceName(settings, `${settings.projectName}-alb-sg`);
  const appSecurityGroupName = buildResourceName(settings, `${settings.projectName}-app-sg`);
  const instanceRoleName = buildResourceName(settings, `${settings.projectName}-ec2-role`, {
    label: 'EC2 instance role name',
    maxLength: 64,
  });
  const keyPairName = buildResourceName(settings, `${settings.projectName}-ssh`);
  const launchTemplateName = buildResourceName(settings, `${settings.projectName}-lt`, {
    label: 'EC2 launch template name',
    maxLength: 128,
  });
  const autoScalingGroupName = buildResourceName(settings, `${settings.projectName}-asg`);
  const loadBalancerName = buildResourceName(settings, `${settings.projectName}-alb`, {
    label: 'Application Load Balancer name',
    maxLength: 32,
  });
  const targetGroupName = buildResourceName(settings, `${settings.projectName}-tg`, {
    label: 'Target group name',
    maxLength: 32,
  });

  const table = new dynamodb.Table(scope, 'RentalTable', {
    tableName,
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
    roleName: instanceRoleName,
    assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
    ],
  });
  table.grantReadWriteData(instanceRole);

  const keyPair = new ec2.KeyPair(scope, 'ApplicationSshKeyPair', {
    keyPairName,
  });

  const albSecurityGroup = new ec2.SecurityGroup(scope, 'AlbSecurityGroup', {
    vpc: network.vpc,
    description: 'Security group for the public ALB',
    allowAllOutbound: true,
  });
  cdk.Tags.of(albSecurityGroup).add('Name', albSecurityGroupName);
  albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP');

  const appSecurityGroup = new ec2.SecurityGroup(scope, 'AppSecurityGroup', {
    vpc: network.vpc,
    description: 'Security group for the Java workload',
    allowAllOutbound: true,
  });
  cdk.Tags.of(appSecurityGroup).add('Name', appSecurityGroupName);
  appSecurityGroup.addIngressRule(
    albSecurityGroup,
    ec2.Port.tcp(8080),
    'Allow ALB to reach the Java workload',
  );
  appSecurityGroup.addIngressRule(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(22),
    'Allow SSH from the internet for bootstrap simulation',
  );

  const appDirectory = `/opt/${settings.projectName}/app`;
  const serviceName = settings.projectName;
  const userData = createBootstrapUserData(scope, {
    appDirectory,
    awsRegion: scope.region,
    instanceRole,
    serviceName,
    tableName,
  });
  const launchTemplate = new ec2.LaunchTemplate(scope, 'ApplicationLaunchTemplate', {
    associatePublicIpAddress: true,
    instanceType: new ec2.InstanceType(settings.instanceType),
    keyPair,
    launchTemplateName,
    machineImage: ec2.MachineImage.latestAmazonLinux2023(),
    role: instanceRole,
    securityGroup: appSecurityGroup,
    userData,
  });

  const asg = new autoscaling.AutoScalingGroup(scope, 'ApplicationAsg', {
    vpc: network.vpc,
    autoScalingGroupName,
    minCapacity: settings.minCapacity,
    maxCapacity: settings.maxCapacity,
    desiredCapacity: settings.desiredCapacity,
    launchTemplate,
    vpcSubnets: {
      subnetType: ec2.SubnetType.PUBLIC,
    },
    healthChecks: autoscaling.HealthChecks.withAdditionalChecks({
      additionalTypes: [autoscaling.AdditionalHealthCheckType.ELB],
      gracePeriod: cdk.Duration.minutes(5),
    }),
  });

  asg.scaleOnCpuUtilization('CpuScaling', {
    targetUtilizationPercent: 60,
    estimatedInstanceWarmup: cdk.Duration.minutes(3),
  });

  const loadBalancer = new elbv2.ApplicationLoadBalancer(scope, 'LoadBalancer', {
    vpc: network.vpc,
    loadBalancerName,
    internetFacing: true,
    securityGroup: albSecurityGroup,
  });

  const targetGroup = new elbv2.ApplicationTargetGroup(scope, 'TargetGroup', {
    vpc: network.vpc,
    targetGroupName,
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
