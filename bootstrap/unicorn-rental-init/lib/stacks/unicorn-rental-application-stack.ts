import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { createBootstrapApplication } from '../bootstrap/application';
import { applyBootstrapTags } from '../bootstrap/settings';
import { BootstrapApplicationResources, BootstrapNetworkResources, BootstrapSettings } from '../bootstrap/types';

interface UnicornRentalApplicationStackProps extends cdk.StackProps {
  network: BootstrapNetworkResources;
  settings: BootstrapSettings;
}

export class UnicornRentalApplicationStack extends cdk.Stack {
  public readonly resources: BootstrapApplicationResources;

  constructor(scope: Construct, id: string, props: UnicornRentalApplicationStackProps) {
    super(scope, id, props);

    applyBootstrapTags(this, props.settings.projectName);
    this.resources = createBootstrapApplication(
      this,
      props.settings,
      props.network,
    );

    new cdk.CfnOutput(this, 'LoadBalancerDnsName', {
      value: this.resources.loadBalancer.loadBalancerDnsName,
      description: 'Public ALB DNS name for the placeholder Java workload',
    });

    new cdk.CfnOutput(this, 'TargetGroupArn', {
      value: this.resources.targetGroup.targetGroupArn,
      description: 'Initial target group ARN',
    });

    new cdk.CfnOutput(this, 'AutoScalingGroupName', {
      value: this.resources.asg.autoScalingGroupName,
      description: 'Initial Auto Scaling Group name',
    });

    new cdk.CfnOutput(this, 'DynamoTableName', {
      value: this.resources.table.tableName,
      description: 'Initial DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'InstanceRoleArn', {
      value: this.resources.instanceRole.roleArn,
      description: 'EC2 instance role ARN for the application stack',
    });

    new cdk.CfnOutput(this, 'Ec2KeyPairName', {
      value: this.resources.keyPair.keyPairName,
      description: 'EC2 key pair name attached to the application instances',
    });

    new cdk.CfnOutput(this, 'Ec2PrivateKeyParameterName', {
      value: this.resources.keyPair.privateKey.parameterName,
      description: 'SSM parameter name that stores the generated EC2 private key material',
    });

    new cdk.CfnOutput(this, 'Ec2PrivateKeyMaterial', {
      value: this.resources.keyPair.privateKey.stringValue,
      description: 'Private key material for the EC2 key pair. Stored by EC2 in SSM Parameter Store.',
    });
  }
}
