import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { createBootstrapOperatorAccess } from '../bootstrap/operator-access';
import { applyBootstrapTags } from '../bootstrap/settings';
import {
  BootstrapAccessResources,
  BootstrapNetworkResources,
  BootstrapSettings,
} from '../bootstrap/types';

interface UnicornRentalAccessStackProps extends cdk.StackProps {
  network: BootstrapNetworkResources;
  settings: BootstrapSettings;
}

export class UnicornRentalAccessStack extends cdk.Stack {
  public readonly resources: BootstrapAccessResources;

  constructor(scope: Construct, id: string, props: UnicornRentalAccessStackProps) {
    super(scope, id, props);

    applyBootstrapTags(this, props.settings.projectName);
    this.resources = createBootstrapOperatorAccess(
      this,
      props.settings,
      props.network,
    );

    new cdk.CfnOutput(this, 'CloudFormationExecutionRoleArn', {
      value: this.resources.cloudFormationExecutionRole.roleArn,
      description: 'Role that the restricted operator user must pass to CloudFormation',
    });

    new cdk.CfnOutput(this, 'OperatorUserNameOutput', {
      value: this.resources.operatorUser.userName,
      description: 'Restricted operator IAM user name',
    });

    new cdk.CfnOutput(this, 'OperatorAccessKeyId', {
      value: this.resources.accessKey.ref,
      description: 'Access key ID for the restricted operator IAM user',
    });

    new cdk.CfnOutput(this, 'OperatorSecretAccessKey', {
      value: this.resources.accessKey.attrSecretAccessKey,
      description: 'Secret access key for the restricted operator IAM user',
    });
  }
}
