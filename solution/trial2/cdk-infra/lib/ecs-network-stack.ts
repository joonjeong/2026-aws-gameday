import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * 기존 UnicornRentalNetworkStack에 Private Subnet + NAT Gateway 추가.
 * 기존 스택을 수정하지 않고 별도 스택으로 관리.
 */
export class UnicornRentalEcsNetworkStack extends cdk.Stack {
  public readonly privateSubnet1: ec2.CfnSubnet;
  public readonly privateSubnet2: ec2.CfnSubnet;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcId = 'vpc-03942a987eca4fc09';
    const publicSubnet1Id = 'subnet-0a17534532f685133'; // 2a
    const publicSubnet2Id = 'subnet-06ab851233d51d199'; // 2b

    // ── Private Subnet 1 (ap-northeast-2a, 10.0.2.0/24) ─────
    this.privateSubnet1 = new ec2.CfnSubnet(this, 'PrivateSubnet1', {
      vpcId,
      cidrBlock: '10.0.2.0/24',
      availabilityZone: 'ap-northeast-2a',
      mapPublicIpOnLaunch: false,
      tags: [
        { key: 'Name', value: 'unicorn-rental-private-2a' },
        { key: 'Project', value: 'unicorn-rental' },
        { key: 'aws-cdk:subnet-type', value: 'Private' },
      ],
    });

    // ── Private Subnet 2 (ap-northeast-2b, 10.0.3.0/24) ─────
    this.privateSubnet2 = new ec2.CfnSubnet(this, 'PrivateSubnet2', {
      vpcId,
      cidrBlock: '10.0.3.0/24',
      availabilityZone: 'ap-northeast-2b',
      mapPublicIpOnLaunch: false,
      tags: [
        { key: 'Name', value: 'unicorn-rental-private-2b' },
        { key: 'Project', value: 'unicorn-rental' },
        { key: 'aws-cdk:subnet-type', value: 'Private' },
      ],
    });

    // ── NAT Gateway (퍼블릭 서브넷 2a에 배치) ────────────────
    const eip = new ec2.CfnEIP(this, 'NatEip', { domain: 'vpc' });

    const natGateway = new ec2.CfnNatGateway(this, 'NatGateway', {
      subnetId: publicSubnet1Id,
      allocationId: eip.attrAllocationId,
      tags: [{ key: 'Name', value: 'unicorn-rental-nat' }, { key: 'Project', value: 'unicorn-rental' }],
    });

    // ── Private Route Tables ──────────────────────────────────
    const privateRt1 = new ec2.CfnRouteTable(this, 'PrivateRt1', {
      vpcId,
      tags: [{ key: 'Name', value: 'unicorn-rental-private-rt-2a' }],
    });
    new ec2.CfnRoute(this, 'PrivateRoute1', {
      routeTableId: privateRt1.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGateway.ref,
    });
    new ec2.CfnSubnetRouteTableAssociation(this, 'PrivateRtAssoc1', {
      routeTableId: privateRt1.ref,
      subnetId: this.privateSubnet1.ref,
    });

    const privateRt2 = new ec2.CfnRouteTable(this, 'PrivateRt2', {
      vpcId,
      tags: [{ key: 'Name', value: 'unicorn-rental-private-rt-2b' }],
    });
    new ec2.CfnRoute(this, 'PrivateRoute2', {
      routeTableId: privateRt2.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGateway.ref,
    });
    new ec2.CfnSubnetRouteTableAssociation(this, 'PrivateRtAssoc2', {
      routeTableId: privateRt2.ref,
      subnetId: this.privateSubnet2.ref,
    });

    // ── Outputs ───────────────────────────────────────────────
    new cdk.CfnOutput(this, 'PrivateSubnet1Id', {
      value: this.privateSubnet1.ref,
      exportName: 'UnicornRentalEcsNetworkStack:PrivateSubnet1Id',
    });
    new cdk.CfnOutput(this, 'PrivateSubnet2Id', {
      value: this.privateSubnet2.ref,
      exportName: 'UnicornRentalEcsNetworkStack:PrivateSubnet2Id',
    });
    new cdk.CfnOutput(this, 'NatGatewayId', {
      value: natGateway.ref,
      exportName: 'UnicornRentalEcsNetworkStack:NatGatewayId',
    });
  }
}
