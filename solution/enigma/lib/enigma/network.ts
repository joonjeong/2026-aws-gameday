import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { buildResourceName } from './settings';
import { EnigmaSettings, TrafficNetworkResources } from './types';

export function createTrafficNetwork(
  scope: cdk.Stack,
  settings: EnigmaSettings,
): TrafficNetworkResources {
  const vpcName = buildResourceName(settings, `${settings.projectName}-traffic-vpc`);

  const vpc = new ec2.Vpc(scope, 'TrafficVpc', {
    vpcName,
    maxAzs: 2,
    natGateways: 0,
    subnetConfiguration: [
      {
        name: 'public',
        subnetType: ec2.SubnetType.PUBLIC,
        cidrMask: 24,
      },
    ],
  });

  return {
    vpc,
    vpcArn: scope.formatArn({
      service: 'ec2',
      resource: 'vpc',
      resourceName: vpc.vpcId,
    }),
    publicSubnetIds: vpc.publicSubnets.map((subnet) => subnet.subnetId),
    publicSubnetArns: vpc.publicSubnets.map((subnet) =>
      scope.formatArn({
        service: 'ec2',
        resource: 'subnet',
        resourceName: subnet.subnetId,
      }),
    ),
  };
}

