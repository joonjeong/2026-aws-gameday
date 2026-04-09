import * as cdk from 'aws-cdk-lib';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { resolveAppArtifactPath, resolveAppDirectory, stageSingleFileDirectory } from './paths';
import { buildResourceName } from './settings';
import {
  BootstrapApplicationResources,
  BootstrapNetworkResources,
  BootstrapSettings,
  BootstrapSolutionResources,
} from './types';
import { createBootstrapUserData } from './user-data';

export function createBootstrapApplication(
  scope: cdk.Stack,
  settings: BootstrapSettings,
  network: BootstrapNetworkResources,
  solution: BootstrapSolutionResources,
): BootstrapApplicationResources {
  const deploymentBucketName = buildResourceName(settings, `${settings.projectName}-artifacts`, {
    label: 'Artifact bucket name',
    maxLength: 63,
  });
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
  const sourceCodePrefix = 'source/app';
  const artifactObjectKey = `artifacts/${settings.artifactFileName}`;

  const deploymentBucket = new s3.Bucket(scope, 'ArtifactBucket', {
    bucketName: deploymentBucketName,
    autoDeleteObjects: true,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    versioned: true,
  });

  const sourceDeployment = new s3deploy.BucketDeployment(scope, 'SourceCodeDeployment', {
    destinationBucket: deploymentBucket,
    destinationKeyPrefix: sourceCodePrefix,
    retainOnDelete: false,
    sources: [
      s3deploy.Source.asset(resolveAppDirectory(), {
        exclude: ['.gradle/**', 'build/**'],
      }),
    ],
  });

  const artifactStagingDirectory = stageSingleFileDirectory(
    'unicorn-rental-artifact-',
    resolveAppArtifactPath(settings.artifactFileName),
    settings.artifactFileName,
  );
  const artifactDeployment = new s3deploy.BucketDeployment(scope, 'ArtifactDeployment', {
    destinationBucket: deploymentBucket,
    destinationKeyPrefix: 'artifacts',
    retainOnDelete: false,
    sources: [s3deploy.Source.asset(artifactStagingDirectory)],
  });

  const instanceRole = new iam.Role(scope, 'BootstrapInstanceRole', {
    roleName: instanceRoleName,
    assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
    ],
  });
  solution.sessionTable.grantReadWriteData(instanceRole);
  deploymentBucket.grantRead(instanceRole);
  const databaseSecret = solution.database.secret;
  if (!databaseSecret) {
    throw new Error('Expected the solution stack to expose the generated RDS secret.');
  }
  databaseSecret.grantRead(instanceRole);

  const keyPair = new ec2.KeyPair(scope, 'ApplicationSshKeyPair', {
    keyPairName,
  });

  const appDirectory = `/opt/${settings.projectName}/app`;
  const serviceName = settings.projectName;
  const userData = createBootstrapUserData(scope, {
    appDirectory,
    artifactBucket: deploymentBucket,
    artifactObjectKey,
    artifactFileName: settings.artifactFileName,
    awsRegion: scope.region,
    databaseEndpointAddress: solution.database.instanceEndpoint.hostname,
    databaseName: settings.databaseName,
    databaseSecretArn: solution.databaseSecretArn,
    databaseUsername: settings.databaseUsername,
    serviceName,
    sessionTableName: solution.sessionTable.tableName,
    sessionTtlHours: settings.sessionTtlHours,
  });
  const launchTemplate = new ec2.LaunchTemplate(scope, 'ApplicationLaunchTemplate', {
    associatePublicIpAddress: true,
    instanceType: new ec2.InstanceType(settings.instanceType),
    keyPair,
    launchTemplateName,
    machineImage: ec2.MachineImage.latestAmazonLinux2023(),
    role: instanceRole,
    securityGroup: solution.appSecurityGroup,
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
  asg.node.addDependency(sourceDeployment);
  asg.node.addDependency(artifactDeployment);
  asg.node.addDependency(solution.database);

  asg.scaleOnCpuUtilization('CpuScaling', {
    targetUtilizationPercent: 60,
    estimatedInstanceWarmup: cdk.Duration.minutes(3),
  });

  asg.attachToApplicationTargetGroup(solution.targetGroup);

  return {
    deploymentBucket,
    instanceRole,
    asg,
    keyPair,
    artifactObjectKey,
    sourceCodePrefix,
  };
}
