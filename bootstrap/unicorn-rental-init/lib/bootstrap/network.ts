import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { BootstrapNetworkResources } from './types';

export function createBootstrapNetwork(
  scope: cdk.Stack,
  projectName: string,
): BootstrapNetworkResources {
  const vpc = new ec2.Vpc(scope, 'IsolatedVpc', {
    vpcName: `${projectName}-vpc`,
    maxAzs: 2,
    natGateways: 1,
    subnetConfiguration: [
      {
        name: 'public',
        subnetType: ec2.SubnetType.PUBLIC,
        cidrMask: 24,
      },
      {
        name: 'app',
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        cidrMask: 24,
      },
    ],
  });

  const albSecurityGroup = new ec2.SecurityGroup(scope, 'AlbSecurityGroup', {
    vpc,
    description: 'Security group for the public ALB',
    allowAllOutbound: true,
    securityGroupName: `${projectName}-alb-sg`,
  });
  albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP');

  const appSecurityGroup = new ec2.SecurityGroup(scope, 'AppSecurityGroup', {
    vpc,
    description: 'Security group for the Java workload',
    allowAllOutbound: true,
    securityGroupName: `${projectName}-app-sg`,
  });
  appSecurityGroup.addIngressRule(
    albSecurityGroup,
    ec2.Port.tcp(8080),
    'Allow ALB to reach the Java workload',
  );
  appSecurityGroup.addIngressRule(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(22),
    'Allow SSH from the internet for bootstrap simulation',
  );

  const allSubnets = [...vpc.publicSubnets, ...vpc.privateSubnets];

  return {
    vpc,
    albSecurityGroup,
    appSecurityGroup,
    vpcArn: scope.formatArn({
      service: 'ec2',
      resource: 'vpc',
      resourceName: vpc.vpcId,
    }),
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
