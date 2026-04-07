import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { buildResourceName } from './settings';
import { BootstrapNetworkResources, BootstrapSettings } from './types';

export function createBootstrapNetwork(
  scope: cdk.Stack,
  settings: BootstrapSettings,
): BootstrapNetworkResources {
  const vpcName = buildResourceName(settings, `${settings.projectName}-vpc`, {
    label: 'VPC name',
    maxLength: 255,
  });

  const vpc = new ec2.Vpc(scope, 'ComplexVpc', {
    vpcName,
    maxAzs: 2,
    natGateways: 0,
    subnetConfiguration: [
      {
        name: 'public',
        subnetType: ec2.SubnetType.PUBLIC,
        cidrMask: 24,
      },
      {
        name: 'private-db',
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        cidrMask: 24,
      },
    ],
  });

  const allSubnets = [...vpc.publicSubnets, ...vpc.isolatedSubnets];

  return {
    vpc,
    vpcArn: scope.formatArn({
      service: 'ec2',
      resource: 'vpc',
      resourceName: vpc.vpcId,
    }),
    publicSubnetIds: vpc.publicSubnets.map((subnet) => subnet.subnetId),
    privateSubnetIds: vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
    allSubnetIds: allSubnets.map((subnet) => subnet.subnetId),
    allSubnetArns: allSubnets.map((subnet) =>
      scope.formatArn({
        service: 'ec2',
        resource: 'subnet',
        resourceName: subnet.subnetId,
      }),
    ),
  };
}
