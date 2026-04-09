import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';

export interface BootstrapSettings {
  resourcePrefix?: string;
  projectName: string;
  instanceType: string;
  databaseInstanceType: string;
  desiredCapacity: number;
  minCapacity: number;
  maxCapacity: number;
  healthCheckPath: string;
  databaseName: string;
  databaseUsername: string;
  artifactFileName: string;
  sessionTtlHours: number;
}

export interface BootstrapNetworkResources {
  vpc: ec2.Vpc;
  vpcArn: string;
  publicSubnetIds: string[];
  privateSubnetIds: string[];
  allSubnetIds: string[];
  allSubnetArns: string[];
}

export interface BootstrapSolutionResources {
  albSecurityGroup: ec2.SecurityGroup;
  appSecurityGroup: ec2.SecurityGroup;
  databaseSecurityGroup: ec2.SecurityGroup;
  sessionTable: dynamodb.Table;
  loadBalancer: elbv2.ApplicationLoadBalancer;
  targetGroup: elbv2.ApplicationTargetGroup;
  database: rds.DatabaseInstance;
  databaseSecretArn: string;
}

export interface BootstrapApplicationResources {
  deploymentBucket: s3.Bucket;
  instanceRole: iam.Role;
  asg: autoscaling.AutoScalingGroup;
  keyPair: ec2.KeyPair;
  artifactObjectKey: string;
  sourceCodePrefix: string;
}
