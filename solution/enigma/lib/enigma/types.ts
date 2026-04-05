import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface EnigmaSettings {
  resourcePrefix?: string;
  projectName: string;
  targetBaseUrl: string;
  targetTimeoutMs: number;
  baselineEnabled: boolean;
  anomalyEnabled: boolean;
  baselineScheduleExpression: string;
  anomalyScheduleExpression: string;
  scheduleTimezone: string;
  anomalyFlexibleWindowMinutes: number;
  baselineCpu: number;
  baselineMemoryMiB: number;
  anomalyCpu: number;
  anomalyMemoryMiB: number;
}

export interface TrafficNetworkResources {
  vpc: ec2.Vpc;
  vpcArn: string;
  publicSubnetIds: string[];
  publicSubnetArns: string[];
}

export interface TrafficInjectionResources {
  network: TrafficNetworkResources;
  cluster: ecs.Cluster;
  taskSecurityGroup: ec2.SecurityGroup;
  baselineTaskDefinition: ecs.FargateTaskDefinition;
  anomalyTaskDefinition: ecs.FargateTaskDefinition;
  baselineLogGroup: logs.LogGroup;
  anomalyLogGroup: logs.LogGroup;
  scheduleGroupName: string;
  baselineScheduleName: string;
  anomalyScheduleName: string;
}

