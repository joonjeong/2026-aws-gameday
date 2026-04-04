import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface BootstrapSettings {
  projectName: string;
  operatorUserName: string;
  instanceType: string;
  desiredCapacity: number;
  minCapacity: number;
  maxCapacity: number;
  healthCheckPath: string;
}

export interface BootstrapNetworkResources {
  vpc: ec2.Vpc;
  albSecurityGroup: ec2.SecurityGroup;
  appSecurityGroup: ec2.SecurityGroup;
  vpcArn: string;
  allSubnetIds: string[];
  allSubnetArns: string[];
}

export interface BootstrapApplicationResources {
  table: dynamodb.Table;
  instanceRole: iam.Role;
  asg: autoscaling.AutoScalingGroup;
  loadBalancer: elbv2.ApplicationLoadBalancer;
  targetGroup: elbv2.ApplicationTargetGroup;
  keyPair: ec2.KeyPair;
}

export interface BootstrapAccessResources {
  cloudFormationExecutionRole: iam.Role;
  operatorUser: iam.User;
  accessKey: iam.CfnAccessKey;
}
