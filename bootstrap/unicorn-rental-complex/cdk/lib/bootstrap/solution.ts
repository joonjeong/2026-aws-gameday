import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { buildResourceName } from './settings';
import { BootstrapNetworkResources, BootstrapSettings, BootstrapSolutionResources } from './types';

export function createBootstrapSolution(
  scope: cdk.Stack,
  settings: BootstrapSettings,
  network: BootstrapNetworkResources,
): BootstrapSolutionResources {
  const sessionTableName = buildResourceName(settings, `${settings.projectName}-sessions`);
  const albSecurityGroupName = buildResourceName(settings, `${settings.projectName}-alb-sg`);
  const appSecurityGroupName = buildResourceName(settings, `${settings.projectName}-app-sg`);
  const databaseSecurityGroupName = buildResourceName(settings, `${settings.projectName}-db-sg`);
  const loadBalancerName = buildResourceName(settings, `${settings.projectName}-alb`, {
    label: 'Application Load Balancer name',
    maxLength: 32,
  });
  const targetGroupName = buildResourceName(settings, `${settings.projectName}-tg`, {
    label: 'Target group name',
    maxLength: 32,
  });

  const sessionTable = new dynamodb.Table(scope, 'SessionTable', {
    tableName: sessionTableName,
    partitionKey: {
      name: 'sessionId',
      type: dynamodb.AttributeType.STRING,
    },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    timeToLiveAttribute: 'expiresAt',
    pointInTimeRecoverySpecification: {
      pointInTimeRecoveryEnabled: true,
    },
    removalPolicy: cdk.RemovalPolicy.DESTROY,
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
    description: 'Security group for the public Spring Boot workload',
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

  const databaseSecurityGroup = new ec2.SecurityGroup(scope, 'DatabaseSecurityGroup', {
    vpc: network.vpc,
    description: 'Security group for the private Postgres instance',
    allowAllOutbound: true,
  });
  cdk.Tags.of(databaseSecurityGroup).add('Name', databaseSecurityGroupName);
  databaseSecurityGroup.addIngressRule(
    appSecurityGroup,
    ec2.Port.tcp(5432),
    'Allow app instances to reach Postgres',
  );

  const database = new rds.DatabaseInstance(scope, 'PostgresDatabase', {
    databaseName: settings.databaseName,
    credentials: rds.Credentials.fromGeneratedSecret(settings.databaseUsername),
    deleteAutomatedBackups: true,
    deletionProtection: false,
    engine: rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.VER_16_12,
    }),
    instanceType: new ec2.InstanceType(settings.databaseInstanceType),
    multiAz: false,
    publiclyAccessible: false,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    securityGroups: [databaseSecurityGroup],
    storageType: rds.StorageType.GP3,
    vpc: network.vpc,
    vpcSubnets: {
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    },
  });

  if (!database.secret) {
    throw new Error('Expected a generated RDS secret for the Postgres database.');
  }

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

  loadBalancer.addListener('HttpListener', {
    port: 80,
    protocol: elbv2.ApplicationProtocol.HTTP,
    defaultTargetGroups: [targetGroup],
    open: true,
  });

  return {
    albSecurityGroup,
    appSecurityGroup,
    databaseSecurityGroup,
    sessionTable,
    loadBalancer,
    targetGroup,
    database,
    databaseSecretArn: database.secret.secretArn,
  };
}
