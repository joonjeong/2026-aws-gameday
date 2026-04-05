import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { applyEnigmaTags } from '../enigma/settings';
import { createTrafficInfrastructure } from '../enigma/traffic';
import { EnigmaSettings } from '../enigma/types';

interface EnigmaTrafficStackProps extends cdk.StackProps {
  settings: EnigmaSettings;
}

export class EnigmaTrafficStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EnigmaTrafficStackProps) {
    super(scope, id, props);

    applyEnigmaTags(this, props.settings);
    const resources = createTrafficInfrastructure(this, props.settings);

    new cdk.CfnOutput(this, 'TargetBaseUrl', {
      value: props.settings.targetBaseUrl,
      description: 'Target base URL that scheduled k6 tasks hit.',
    });

    new cdk.CfnOutput(this, 'TrafficVpcId', {
      value: resources.network.vpc.vpcId,
      description: 'Dedicated VPC ID for the scheduled traffic injectors.',
    });

    new cdk.CfnOutput(this, 'TrafficPublicSubnetIds', {
      value: resources.network.publicSubnetIds.join(','),
      description: 'Public subnet IDs used by the scheduled traffic injectors.',
    });

    new cdk.CfnOutput(this, 'TrafficTaskSecurityGroupId', {
      value: resources.taskSecurityGroup.securityGroupId,
      description: 'Security group attached to the scheduled k6 tasks.',
    });

    new cdk.CfnOutput(this, 'TrafficClusterName', {
      value: resources.cluster.clusterName,
      description: 'ECS cluster that runs the scheduled k6 tasks.',
    });

    new cdk.CfnOutput(this, 'BaselineTaskDefinitionArn', {
      value: resources.baselineTaskDefinition.taskDefinitionArn,
      description: 'Task definition ARN for the steady traffic injector.',
    });

    new cdk.CfnOutput(this, 'AnomalyTaskDefinitionArn', {
      value: resources.anomalyTaskDefinition.taskDefinitionArn,
      description: 'Task definition ARN for the anomaly traffic injector.',
    });

    new cdk.CfnOutput(this, 'ScheduleGroupName', {
      value: resources.scheduleGroupName,
      description: 'EventBridge Scheduler group for all enigma schedules.',
    });

    new cdk.CfnOutput(this, 'BaselineScheduleName', {
      value: resources.baselineScheduleName,
      description: 'EventBridge Scheduler schedule name for steady traffic.',
    });

    new cdk.CfnOutput(this, 'AnomalyScheduleName', {
      value: resources.anomalyScheduleName,
      description: 'EventBridge Scheduler schedule name for anomaly traffic.',
    });

    new cdk.CfnOutput(this, 'BaselineLogGroupName', {
      value: resources.baselineLogGroup.logGroupName,
      description: 'CloudWatch Logs group for steady traffic runs.',
    });

    new cdk.CfnOutput(this, 'AnomalyLogGroupName', {
      value: resources.anomalyLogGroup.logGroupName,
      description: 'CloudWatch Logs group for anomaly traffic runs.',
    });
  }
}
