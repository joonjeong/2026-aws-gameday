import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { createBootstrapNetwork } from '../bootstrap/network';
import { applyBootstrapTags } from '../bootstrap/settings';
import { BootstrapNetworkResources, BootstrapSettings } from '../bootstrap/types';

interface UnicornRentalNetworkStackProps extends cdk.StackProps {
  settings: BootstrapSettings;
}

export class UnicornRentalNetworkStack extends cdk.Stack {
  public readonly resources: BootstrapNetworkResources;

  constructor(scope: Construct, id: string, props: UnicornRentalNetworkStackProps) {
    super(scope, id, props);

    applyBootstrapTags(this, props.settings.projectName);
    this.resources = createBootstrapNetwork(this, props.settings.projectName);

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.resources.vpc.vpcId,
      description: 'Dedicated GameDay VPC ID',
    });

    new cdk.CfnOutput(this, 'VpcArn', {
      value: this.resources.vpcArn,
      description: 'Dedicated GameDay VPC ARN',
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: this.resources.vpc.publicSubnets.map((subnet) => subnet.subnetId).join(','),
      description: 'Public subnet IDs in the isolated GameDay VPC',
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.resources.vpc.privateSubnets.map((subnet) => subnet.subnetId).join(','),
      description: 'Private subnet IDs in the isolated GameDay VPC',
    });
  }
}

