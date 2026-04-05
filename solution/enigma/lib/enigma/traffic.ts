import * as path from 'node:path';
import * as fs from 'node:fs';
import * as cdk from 'aws-cdk-lib';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';
import { buildResourceName } from './settings';
import { createTrafficNetwork } from './network';
import { EnigmaSettings, TrafficInjectionResources } from './types';

const DEFAULT_RENTAL_IDS = 'demo-1,demo-2,demo-3';
const K6_CONTAINER_NAME = 'k6-runner';

interface TaskDefinitionOptions {
  id: string;
  containerLabel: string;
  command: string[];
  cpu: number;
  memoryLimitMiB: number;
  logGroup: logs.LogGroup;
}

export function createTrafficInfrastructure(
  scope: cdk.Stack,
  settings: EnigmaSettings,
): TrafficInjectionResources {
  const network = createTrafficNetwork(scope, settings);
  const clusterName = buildResourceName(settings, `${settings.projectName}-traffic-cluster`, {
    label: 'ECS cluster name',
    maxLength: 255,
  });
  const scheduleGroupName = buildResourceName(settings, `${settings.projectName}-schedules`, {
    label: 'Scheduler group name',
    maxLength: 64,
  });
  const baselineScheduleName = buildResourceName(settings, `${settings.projectName}-baseline`, {
    label: 'Baseline schedule name',
    maxLength: 64,
  });
  const anomalyScheduleName = buildResourceName(settings, `${settings.projectName}-anomaly`, {
    label: 'Anomaly schedule name',
    maxLength: 64,
  });
  const taskSecurityGroupName = buildResourceName(settings, `${settings.projectName}-tasks-sg`);

  const cluster = new ecs.Cluster(scope, 'TrafficCluster', {
    vpc: network.vpc,
    clusterName,
  });

  const taskSecurityGroup = new ec2.SecurityGroup(scope, 'TrafficTaskSecurityGroup', {
    vpc: network.vpc,
    description: 'Security group for scheduled k6 ECS tasks',
    allowAllOutbound: true,
  });
  cdk.Tags.of(taskSecurityGroup).add('Name', taskSecurityGroupName);

  const baselineLogGroup = new logs.LogGroup(scope, 'BaselineLogGroup', {
    logGroupName: `/aws/ecs/${buildResourceName(settings, `${settings.projectName}-baseline`)}`,
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const anomalyLogGroup = new logs.LogGroup(scope, 'AnomalyLogGroup', {
    logGroupName: `/aws/ecs/${buildResourceName(settings, `${settings.projectName}-anomaly`)}`,
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const assetRoot = resolveAssetRoot();
  const imageAsset = new ecrAssets.DockerImageAsset(scope, 'K6RunnerImage', {
    directory: assetRoot,
    file: 'docker/k6-runner/Dockerfile',
    platform: ecrAssets.Platform.LINUX_AMD64,
    exclude: ['cdk.out', 'dist', 'docs', 'node_modules', 'test', 'README.md'],
  });
  const image = ecs.ContainerImage.fromDockerImageAsset(imageAsset);

  const baselineTaskDefinition = createTaskDefinition(scope, settings, image, {
    id: 'BaselineTaskDefinition',
    containerLabel: 'baseline',
    command: ['run', '/scripts/baseline.js'],
    cpu: settings.baselineCpu,
    memoryLimitMiB: settings.baselineMemoryMiB,
    logGroup: baselineLogGroup,
  });

  const anomalyTaskDefinition = createTaskDefinition(scope, settings, image, {
    id: 'AnomalyTaskDefinition',
    containerLabel: 'anomaly',
    command: ['run', '/scripts/anomaly.js'],
    cpu: settings.anomalyCpu,
    memoryLimitMiB: settings.anomalyMemoryMiB,
    logGroup: anomalyLogGroup,
  });

  const schedulerRole = new iam.Role(scope, 'SchedulerRunTaskRole', {
    roleName: buildResourceName(settings, `${settings.projectName}-scheduler-role`, {
      label: 'Scheduler role name',
      maxLength: 64,
    }),
    assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
  });

  const roleArns = new Set(
    [
      baselineTaskDefinition.taskRole.roleArn,
      anomalyTaskDefinition.taskRole.roleArn,
      baselineTaskDefinition.executionRole?.roleArn,
      anomalyTaskDefinition.executionRole?.roleArn,
    ].filter((roleArn): roleArn is string => typeof roleArn === 'string'),
  );

  schedulerRole.addToPolicy(new iam.PolicyStatement({
    sid: 'RunEnigmaTasks',
    actions: ['ecs:RunTask'],
    resources: [
      baselineTaskDefinition.taskDefinitionArn,
      anomalyTaskDefinition.taskDefinitionArn,
    ],
    conditions: {
      ArnEquals: {
        'ecs:cluster': cluster.clusterArn,
      },
    },
  }));

  schedulerRole.addToPolicy(new iam.PolicyStatement({
    sid: 'PassTaskRoles',
    actions: ['iam:PassRole'],
    resources: [...roleArns],
  }));

  const scheduleGroup = new scheduler.CfnScheduleGroup(scope, 'ScheduleGroup', {
    name: scheduleGroupName,
  });

  const baselineSchedule = createSchedule(scope, {
    id: 'BaselineSchedule',
    cluster,
    network,
    taskDefinition: baselineTaskDefinition,
    taskSecurityGroup,
    schedulerRole,
    scheduleGroupName,
    scheduleName: baselineScheduleName,
    scheduleExpression: settings.baselineScheduleExpression,
    scheduleExpressionTimezone: settings.scheduleTimezone,
    enabled: settings.baselineEnabled,
    flexibleWindowMinutes: 0,
    description: 'Steady scheduled traffic against unicorn-rental-init.',
  });

  const anomalySchedule = createSchedule(scope, {
    id: 'AnomalySchedule',
    cluster,
    network,
    taskDefinition: anomalyTaskDefinition,
    taskSecurityGroup,
    schedulerRole,
    scheduleGroupName,
    scheduleName: anomalyScheduleName,
    scheduleExpression: settings.anomalyScheduleExpression,
    scheduleExpressionTimezone: settings.scheduleTimezone,
    enabled: settings.anomalyEnabled,
    flexibleWindowMinutes: settings.anomalyFlexibleWindowMinutes,
    description: 'Jittered anomaly traffic against unicorn-rental-init.',
  });

  baselineSchedule.addDependency(scheduleGroup);
  anomalySchedule.addDependency(scheduleGroup);

  return {
    network,
    cluster,
    taskSecurityGroup,
    baselineTaskDefinition,
    anomalyTaskDefinition,
    baselineLogGroup,
    anomalyLogGroup,
    scheduleGroupName,
    baselineScheduleName,
    anomalyScheduleName,
  };
}

function createTaskDefinition(
  scope: Construct,
  settings: EnigmaSettings,
  image: ecs.ContainerImage,
  options: TaskDefinitionOptions,
): ecs.FargateTaskDefinition {
  const taskDefinition = new ecs.FargateTaskDefinition(scope, options.id, {
    family: buildResourceName(settings, `${settings.projectName}-${options.containerLabel}-task`, {
      label: `${options.containerLabel} task family`,
      maxLength: 255,
    }),
    cpu: options.cpu,
    memoryLimitMiB: options.memoryLimitMiB,
    runtimePlatform: {
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      cpuArchitecture: ecs.CpuArchitecture.X86_64,
    },
  });

  taskDefinition.addContainer('RunnerContainer', {
    containerName: K6_CONTAINER_NAME,
    image,
    command: options.command,
    environment: {
      TARGET_BASE_URL: settings.targetBaseUrl,
      TARGET_TIMEOUT_MS: String(settings.targetTimeoutMs),
      RENTAL_IDS: DEFAULT_RENTAL_IDS,
    },
    logging: ecs.LogDrivers.awsLogs({
      logGroup: options.logGroup,
      streamPrefix: options.containerLabel,
    }),
  });

  return taskDefinition;
}

interface ScheduleOptions {
  id: string;
  cluster: ecs.Cluster;
  network: TrafficInjectionResources['network'];
  taskDefinition: ecs.FargateTaskDefinition;
  taskSecurityGroup: ec2.SecurityGroup;
  schedulerRole: iam.Role;
  scheduleGroupName: string;
  scheduleName: string;
  scheduleExpression: string;
  scheduleExpressionTimezone: string;
  enabled: boolean;
  flexibleWindowMinutes: number;
  description: string;
}

function createSchedule(scope: Construct, options: ScheduleOptions): scheduler.CfnSchedule {
  const flexibleTimeWindow = options.flexibleWindowMinutes > 0
    ? {
      mode: 'FLEXIBLE',
      maximumWindowInMinutes: options.flexibleWindowMinutes,
    }
    : {
      mode: 'OFF',
    };

  return new scheduler.CfnSchedule(scope, options.id, {
    name: options.scheduleName,
    groupName: options.scheduleGroupName,
    description: options.description,
    state: options.enabled ? 'ENABLED' : 'DISABLED',
    scheduleExpression: options.scheduleExpression,
    scheduleExpressionTimezone: options.scheduleExpressionTimezone,
    flexibleTimeWindow,
    target: {
      arn: options.cluster.clusterArn,
      roleArn: options.schedulerRole.roleArn,
      ecsParameters: {
        launchType: 'FARGATE',
        platformVersion: 'LATEST',
        taskCount: 1,
        taskDefinitionArn: options.taskDefinition.taskDefinitionArn,
        networkConfiguration: {
          awsvpcConfiguration: {
            assignPublicIp: 'ENABLED',
            securityGroups: [options.taskSecurityGroup.securityGroupId],
            subnets: options.network.publicSubnetIds,
          },
        },
      },
      retryPolicy: {
        maximumEventAgeInSeconds: 300,
        maximumRetryAttempts: 1,
      },
    },
  });
}

function resolveAssetRoot(): string {
  let currentDirectory = __dirname;

  while (true) {
    const dockerfilePath = path.join(currentDirectory, 'docker', 'k6-runner', 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error(`Unable to locate enigma asset root from ${__dirname}.`);
    }

    currentDirectory = parentDirectory;
  }
}
