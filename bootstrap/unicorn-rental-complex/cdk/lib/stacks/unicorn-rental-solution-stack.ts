import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { createBootstrapSolution } from '../bootstrap/solution';
import { applyBootstrapTags } from '../bootstrap/settings';
import { BootstrapNetworkResources, BootstrapSettings, BootstrapSolutionResources } from '../bootstrap/types';

interface UnicornRentalComplexSolutionStackProps extends cdk.StackProps {
  network: BootstrapNetworkResources;
  settings: BootstrapSettings;
}

export class UnicornRentalComplexSolutionStack extends cdk.Stack {
  public readonly resources: BootstrapSolutionResources;

  constructor(scope: Construct, id: string, props: UnicornRentalComplexSolutionStackProps) {
    super(scope, id, props);

    applyBootstrapTags(this, props.settings);
    this.resources = createBootstrapSolution(
      this,
      props.settings,
      props.network,
    );

    new cdk.CfnOutput(this, 'LoadBalancerDnsName', {
      value: this.resources.loadBalancer.loadBalancerDnsName,
      description: 'Public ALB DNS name for the Spring Boot workload',
    });

    new cdk.CfnOutput(this, 'TargetGroupArn', {
      value: this.resources.targetGroup.targetGroupArn,
      description: 'Initial target group ARN',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpointAddress', {
      value: this.resources.database.instanceEndpoint.hostname,
      description: 'Private Postgres endpoint for the Spring Boot app',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.resources.databaseSecretArn,
      description: 'Secrets Manager ARN that stores the generated Postgres credentials',
    });

    new cdk.CfnOutput(this, 'SessionTableName', {
      value: this.resources.sessionTable.tableName,
      description: 'DynamoDB table name for user sessions',
    });
  }
}
