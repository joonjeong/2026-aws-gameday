import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

const VPC_ID = 'vpc-03942a987eca4fc09';
const PUBLIC_SUBNET_A = 'subnet-0a17534532f685133'; // ap-northeast-2a
const APP_SG_ID = 'sg-02b8b10fe4547d69d';
const LAUNCH_TEMPLATE_ID = 'lt-077fa223e0b715d5e';
const LT_PRIVATE_VERSION = '5'; // AssociatePublicIpAddress: false
const ASG_NAME = 'unicorn-rental-asg';
const TG_ARN = 'arn:aws:elasticloadbalancing:ap-northeast-2:807876133169:targetgroup/unicorn-rental-tg/92f84dff3e7fb72c';

export class UnicornRentalNetworkExtStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // EIP + NAT Gateway in existing public subnet-a
    const eip = new ec2.CfnEIP(this, 'NatEip', { domain: 'vpc' });
    const natGw = new ec2.CfnNatGateway(this, 'NatGw', {
      subnetId: PUBLIC_SUBNET_A,
      allocationId: eip.attrAllocationId,
      tags: [{ key: 'Name', value: 'unicorn-rental-nat' }],
    });

    // Private subnet A (ap-northeast-2a)
    const privateSubnetA = new ec2.CfnSubnet(this, 'PrivateSubnetA', {
      vpcId: VPC_ID,
      cidrBlock: '10.0.2.0/24',
      availabilityZone: 'ap-northeast-2a',
      mapPublicIpOnLaunch: false,
      tags: [
        { key: 'Name', value: 'unicorn-rental-private-a' },
        { key: 'aws-cdk:subnet-type', value: 'Private' },
        { key: 'Project', value: 'unicorn-rental' },
      ],
    });

    // Private subnet B (ap-northeast-2b)
    const privateSubnetB = new ec2.CfnSubnet(this, 'PrivateSubnetB', {
      vpcId: VPC_ID,
      cidrBlock: '10.0.3.0/24',
      availabilityZone: 'ap-northeast-2b',
      mapPublicIpOnLaunch: false,
      tags: [
        { key: 'Name', value: 'unicorn-rental-private-b' },
        { key: 'aws-cdk:subnet-type', value: 'Private' },
        { key: 'Project', value: 'unicorn-rental' },
      ],
    });

    // Route tables: private subnets → NAT GW
    for (const [suffix, subnet] of [['A', privateSubnetA], ['B', privateSubnetB]] as const) {
      const rt = new ec2.CfnRouteTable(this, `PrivateRt${suffix}`, {
        vpcId: VPC_ID,
        tags: [{ key: 'Name', value: `unicorn-rental-private-rt-${suffix.toLowerCase()}` }],
      });
      new ec2.CfnRoute(this, `PrivateRoute${suffix}`, {
        routeTableId: rt.ref,
        destinationCidrBlock: '0.0.0.0/0',
        natGatewayId: natGw.ref,
      });
      new ec2.CfnSubnetRouteTableAssociation(this, `PrivateRtAssoc${suffix}`, {
        subnetId: subnet.ref,
        routeTableId: rt.ref,
      });
    }

    new cdk.CfnOutput(this, 'PrivateSubnetAId', { value: privateSubnetA.ref });
    new cdk.CfnOutput(this, 'PrivateSubnetBId', { value: privateSubnetB.ref });
    new cdk.CfnOutput(this, 'NatGwId', { value: natGw.ref });
    // NOTE: ASG is owned by UnicornRentalApplicationStack — update via CLI after deploy
  }
}
