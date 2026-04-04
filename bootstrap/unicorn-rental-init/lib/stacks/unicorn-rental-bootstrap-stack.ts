import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { createBootstrapApplication } from '../bootstrap/application';
import { createBootstrapNetwork } from '../bootstrap/network';
import { createBootstrapOperatorAccess } from '../bootstrap/operator-access';
import { BootstrapSettings } from '../bootstrap/types';

export class UnicornRentalBootstrapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const projectName = new cdk.CfnParameter(this, 'ProjectName', {
      type: 'String',
      default: 'unicorn-rental',
      description: 'Project name prefix for bootstrap resources',
    });

    const operatorUserName = new cdk.CfnParameter(this, 'OperatorUserName', {
      type: 'String',
      default: 'unicorn-rental-operator',
      description: 'IAM user that operates only through the restricted CloudFormation execution role',
    });

    const instanceType = new cdk.CfnParameter(this, 'InstanceType', {
      type: 'String',
      default: 't3.small',
      description: 'EC2 instance type for the initial Auto Scaling Group',
    });

    const desiredCapacity = new cdk.CfnParameter(this, 'DesiredCapacity', {
      type: 'Number',
      default: 2,
      description: 'Desired instance count',
    });

    const minCapacity = new cdk.CfnParameter(this, 'MinCapacity', {
      type: 'Number',
      default: 2,
      description: 'Minimum instance count',
    });

    const maxCapacity = new cdk.CfnParameter(this, 'MaxCapacity', {
      type: 'Number',
      default: 4,
      description: 'Maximum instance count',
    });

    const healthCheckPath = new cdk.CfnParameter(this, 'HealthCheckPath', {
      type: 'String',
      default: '/actuator/health',
      description: 'ALB health check path',
    });

    cdk.Tags.of(this).add('Project', projectName.valueAsString);
    cdk.Tags.of(this).add('ManagedBy', 'cloudformation');
    cdk.Tags.of(this).add('Purpose', 'gameday-bootstrap');

    const settings: BootstrapSettings = {
      projectName: projectName.valueAsString,
      operatorUserName: operatorUserName.valueAsString,
      instanceType: instanceType.valueAsString,
      desiredCapacity: desiredCapacity.valueAsNumber,
      minCapacity: minCapacity.valueAsNumber,
      maxCapacity: maxCapacity.valueAsNumber,
      healthCheckPath: healthCheckPath.valueAsString,
    };

    const network = createBootstrapNetwork(this, settings.projectName);
    const application = createBootstrapApplication(this, settings, network);
    const access = createBootstrapOperatorAccess(this, settings, network, application);

    new cdk.CfnOutput(this, 'VpcId', {
      value: network.vpc.vpcId,
      description: 'Dedicated GameDay VPC ID',
    });

    new cdk.CfnOutput(this, 'VpcArn', {
      value: network.vpcArn,
      description: 'Dedicated GameDay VPC ARN',
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: network.vpc.publicSubnets.map((subnet) => subnet.subnetId).join(','),
      description: 'Public subnet IDs in the isolated GameDay VPC',
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: network.vpc.privateSubnets.map((subnet) => subnet.subnetId).join(','),
      description: 'Private subnet IDs in the isolated GameDay VPC',
    });

    new cdk.CfnOutput(this, 'LoadBalancerDnsName', {
      value: application.loadBalancer.loadBalancerDnsName,
      description: 'Public ALB DNS name for the placeholder Java workload',
    });

    new cdk.CfnOutput(this, 'TargetGroupArn', {
      value: application.targetGroup.targetGroupArn,
      description: 'Initial target group ARN',
    });

    new cdk.CfnOutput(this, 'AutoScalingGroupName', {
      value: application.asg.autoScalingGroupName,
      description: 'Initial Auto Scaling Group name',
    });

    new cdk.CfnOutput(this, 'DynamoTableName', {
      value: application.table.tableName,
      description: 'Initial DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'InstanceRoleArn', {
      value: application.instanceRole.roleArn,
      description: 'EC2 instance role ARN for the initial workload',
    });

    new cdk.CfnOutput(this, 'Ec2KeyPairName', {
      value: application.keyPair.keyPairName,
      description: 'EC2 key pair name attached to the application instances',
    });

    new cdk.CfnOutput(this, 'Ec2PrivateKeyParameterName', {
      value: application.keyPair.privateKey.parameterName,
      description: 'SSM parameter name that stores the generated EC2 private key material',
    });

    new cdk.CfnOutput(this, 'Ec2PrivateKeyMaterial', {
      value: application.keyPair.privateKey.stringValue,
      description: 'Private key material for the EC2 key pair. Stored by EC2 in SSM Parameter Store.',
    });

    new cdk.CfnOutput(this, 'CloudFormationExecutionRoleArn', {
      value: access.cloudFormationExecutionRole.roleArn,
      description: 'Role that the restricted operator user must pass to CloudFormation',
    });

    new cdk.CfnOutput(this, 'OperatorUserNameOutput', {
      value: access.operatorUser.userName,
      description: 'Restricted operator IAM user name',
    });

    new cdk.CfnOutput(this, 'OperatorAccessKeyId', {
      value: access.accessKey.ref,
      description: 'Access key ID for the restricted operator IAM user',
    });

    new cdk.CfnOutput(this, 'OperatorSecretAccessKey', {
      value: access.accessKey.attrSecretAccessKey,
      description: 'Secret access key for the restricted operator IAM user',
    });
  }
}
