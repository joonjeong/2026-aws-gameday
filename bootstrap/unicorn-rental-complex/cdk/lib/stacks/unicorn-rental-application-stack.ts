import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { createBootstrapApplication } from '../bootstrap/application';
import { applyBootstrapTags } from '../bootstrap/settings';
import {
  BootstrapApplicationResources,
  BootstrapNetworkResources,
  BootstrapSettings,
  BootstrapSolutionResources,
} from '../bootstrap/types';

interface UnicornRentalApplicationStackProps extends cdk.StackProps {
  network: BootstrapNetworkResources;
  settings: BootstrapSettings;
  solution: BootstrapSolutionResources;
}

export class UnicornRentalApplicationStack extends cdk.Stack {
  public readonly resources: BootstrapApplicationResources;

  constructor(scope: Construct, id: string, props: UnicornRentalApplicationStackProps) {
    super(scope, id, props);

    applyBootstrapTags(this, props.settings);
    this.resources = createBootstrapApplication(
      this,
      props.settings,
      props.network,
      props.solution,
    );

    new cdk.CfnOutput(this, 'AutoScalingGroupName', {
      value: this.resources.asg.autoScalingGroupName,
      description: 'Initial Auto Scaling Group name',
    });

    new cdk.CfnOutput(this, 'ArtifactBucketName', {
      value: this.resources.deploymentBucket.bucketName,
      description: 'S3 bucket that stores the Spring Boot artifact and source snapshot',
    });

    new cdk.CfnOutput(this, 'ArtifactObjectKey', {
      value: this.resources.artifactObjectKey,
      description: 'S3 object key for the bootJar artifact downloaded by EC2 user-data',
    });

    new cdk.CfnOutput(this, 'SourceCodePrefix', {
      value: this.resources.sourceCodePrefix,
      description: 'S3 prefix that stores the uploaded application source tree',
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
  }
}
