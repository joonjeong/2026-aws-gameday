import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import {
  BootstrapAccessResources,
  BootstrapNetworkResources,
  BootstrapSettings,
} from './types';

const READ_ONLY_ACTIONS = [
  'autoscaling:Describe*',
  'cloudwatch:Describe*',
  'cloudwatch:Get*',
  'cloudwatch:List*',
  'dynamodb:Describe*',
  'dynamodb:List*',
  'ec2:Describe*',
  'elasticloadbalancing:Describe*',
  'iam:Get*',
  'iam:List*',
  'logs:Describe*',
  'logs:Get*',
  'logs:ListTagsLogGroup',
  'ssm:Describe*',
  'ssm:Get*',
  'ssm:List*',
  'sts:GetCallerIdentity',
];

export function createBootstrapOperatorAccess(
  scope: cdk.Stack,
  settings: BootstrapSettings,
  network: BootstrapNetworkResources,
): BootstrapAccessResources {
  const ec2InstanceArn = scope.formatArn({
    service: 'ec2',
    resource: 'instance',
    resourceName: '*',
  });
  const ec2VolumeArn = scope.formatArn({
    service: 'ec2',
    resource: 'volume',
    resourceName: '*',
  });
  const ec2EniArn = scope.formatArn({
    service: 'ec2',
    resource: 'network-interface',
    resourceName: '*',
  });
  const ec2SecurityGroupArn = scope.formatArn({
    service: 'ec2',
    resource: 'security-group',
    resourceName: '*',
  });
  const ec2KeyPairArn = scope.formatArn({
    service: 'ec2',
    resource: 'key-pair',
    resourceName: '*',
  });
  const ec2LaunchTemplateArn = scope.formatArn({
    service: 'ec2',
    resource: 'launch-template',
    resourceName: '*',
  });
  const ec2AmiArn = `arn:${scope.partition}:ec2:${scope.region}::image/*`;

  const cloudFormationExecutionRole = new iam.Role(scope, 'CloudFormationExecutionRole', {
    roleName: `${settings.projectName}-cfn-exec`,
    assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
    description: 'Restricted execution role for VPC-scoped GameDay infrastructure changes',
    inlinePolicies: {
      ReadOnlyVisibility: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: READ_ONLY_ACTIONS,
            resources: ['*'],
          }),
        ],
      }),
      WorkloadProvisioning: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'dynamodb:CreateTable',
              'dynamodb:DeleteTable',
              'dynamodb:UpdateTable',
              'dynamodb:TagResource',
              'dynamodb:UntagResource',
              'dynamodb:DescribeTable',
              'dynamodb:UpdateContinuousBackups',
              'logs:CreateLogGroup',
              'logs:DeleteLogGroup',
              'logs:PutRetentionPolicy',
              'logs:DeleteRetentionPolicy',
              'logs:TagResource',
              'logs:UntagResource',
              'cloudwatch:PutDashboard',
              'cloudwatch:DeleteDashboards',
              'cloudwatch:PutMetricAlarm',
              'cloudwatch:DeleteAlarms',
              'sns:CreateTopic',
              'sns:DeleteTopic',
              'sns:Subscribe',
              'sns:Unsubscribe',
              'sns:SetTopicAttributes',
              'sns:TagResource',
              'sns:UntagResource',
              'ssm:PutParameter',
              'ssm:DeleteParameter',
              'ssm:AddTagsToResource',
              'ssm:RemoveTagsFromResource',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ec2:CreateSecurityGroup'],
            resources: ['*'],
            conditions: {
              ArnEquals: {
                'ec2:Vpc': network.vpcArn,
              },
            },
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'ec2:AuthorizeSecurityGroupIngress',
              'ec2:AuthorizeSecurityGroupEgress',
              'ec2:RevokeSecurityGroupIngress',
              'ec2:RevokeSecurityGroupEgress',
              'ec2:DeleteSecurityGroup',
              'ec2:CreateTags',
              'ec2:DeleteTags',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ec2:RunInstances'],
            resources: [
              ec2AmiArn,
              ec2InstanceArn,
              ec2VolumeArn,
              ec2EniArn,
              ec2SecurityGroupArn,
              ec2KeyPairArn,
              ec2LaunchTemplateArn,
              ...network.allSubnetArns,
            ],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'ec2:CreateKeyPair',
              'ec2:DeleteKeyPair',
              'ec2:TerminateInstances',
              'ec2:StartInstances',
              'ec2:StopInstances',
              'ec2:RebootInstances',
              'ec2:ModifyInstanceAttribute',
              'ec2:AssociateIamInstanceProfile',
              'ec2:DisassociateIamInstanceProfile',
              'ec2:ReplaceIamInstanceProfileAssociation',
              'ec2:CreateLaunchTemplate',
              'ec2:CreateLaunchTemplateVersion',
              'ec2:DeleteLaunchTemplate',
              'ec2:DeleteLaunchTemplateVersions',
              'ec2:ModifyLaunchTemplate',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'elasticloadbalancing:CreateLoadBalancer',
              'elasticloadbalancing:SetSubnets',
            ],
            resources: ['*'],
            conditions: {
              'ForAllValues:StringEquals': {
                'elasticloadbalancing:Subnet': network.allSubnetIds,
              },
            },
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'elasticloadbalancing:CreateListener',
              'elasticloadbalancing:DeleteListener',
              'elasticloadbalancing:CreateRule',
              'elasticloadbalancing:DeleteRule',
              'elasticloadbalancing:CreateTargetGroup',
              'elasticloadbalancing:DeleteTargetGroup',
              'elasticloadbalancing:ModifyTargetGroup',
              'elasticloadbalancing:ModifyTargetGroupAttributes',
              'elasticloadbalancing:ModifyLoadBalancerAttributes',
              'elasticloadbalancing:SetSecurityGroups',
              'elasticloadbalancing:RegisterTargets',
              'elasticloadbalancing:DeregisterTargets',
              'elasticloadbalancing:AddTags',
              'elasticloadbalancing:RemoveTags',
              'elasticloadbalancing:DeleteLoadBalancer',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'autoscaling:CreateAutoScalingGroup',
              'autoscaling:UpdateAutoScalingGroup',
            ],
            resources: ['*'],
            conditions: {
              'ForAllValues:StringEquals': {
                'autoscaling:VPCZoneIdentifiers': network.allSubnetIds,
              },
            },
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'autoscaling:DeleteAutoScalingGroup',
              'autoscaling:SetDesiredCapacity',
              'autoscaling:StartInstanceRefresh',
              'autoscaling:CancelInstanceRefresh',
              'autoscaling:PutScalingPolicy',
              'autoscaling:DeletePolicy',
              'autoscaling:AttachLoadBalancerTargetGroups',
              'autoscaling:DetachLoadBalancerTargetGroups',
              'autoscaling:SuspendProcesses',
              'autoscaling:ResumeProcesses',
              'autoscaling:CreateOrUpdateTags',
              'autoscaling:DeleteTags',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iam:PassRole'],
            resources: [
              scope.formatArn({
                service: 'iam',
                region: '',
                resource: 'role',
                resourceName: `${settings.projectName}-ec2-role`,
              }),
            ],
          }),
        ],
      }),
    },
  });

  const operatorUser = new iam.User(scope, 'OperatorUser', {
    userName: settings.operatorUserName,
  });

  operatorUser.attachInlinePolicy(
    new iam.Policy(scope, 'OperatorControlPlanePolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'cloudformation:CreateStack',
            'cloudformation:UpdateStack',
            'cloudformation:DeleteStack',
            'cloudformation:CreateChangeSet',
            'cloudformation:ExecuteChangeSet',
            'cloudformation:DeleteChangeSet',
            'cloudformation:Describe*',
            'cloudformation:Get*',
            'cloudformation:List*',
            'cloudformation:DetectStackDrift',
            'cloudformation:DetectStackResourceDrift',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: READ_ONLY_ACTIONS.filter((action) => action !== 'logs:ListTagsLogGroup'),
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [cloudFormationExecutionRole.roleArn],
        }),
      ],
    }),
  );

  const accessKey = new iam.CfnAccessKey(scope, 'OperatorAccessKey', {
    userName: operatorUser.userName,
  });

  return {
    cloudFormationExecutionRole,
    operatorUser,
    accessKey,
  };
}
