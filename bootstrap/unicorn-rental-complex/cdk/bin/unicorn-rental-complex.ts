#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { buildStackName, loadBootstrapSettings } from '../lib/bootstrap/settings';
import { UnicornRentalApplicationStack } from '../lib/stacks/unicorn-rental-application-stack';
import { UnicornRentalComplexSolutionStack } from '../lib/stacks/unicorn-rental-solution-stack';
import { UnicornRentalNetworkStack } from '../lib/stacks/unicorn-rental-network-stack';

const app = new cdk.App();
const settings = loadBootstrapSettings(app);
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2',
};

const networkStack = new UnicornRentalNetworkStack(app, 'UnicornRentalComplexNetworkStack', {
  env,
  settings,
  stackName: buildStackName(settings, 'UnicornRentalComplexNetworkStack'),
  description: 'Dedicated GameDay VPC with public app and private database subnets',
});

const solutionStack = new UnicornRentalComplexSolutionStack(app, 'UnicornRentalComplexSolutionStack', {
  env,
  network: networkStack.resources,
  settings,
  stackName: buildStackName(settings, 'UnicornRentalComplexSolutionStack'),
  description: 'Application Load Balancer, Postgres, and shared security groups for the Spring Boot workload',
});

new UnicornRentalApplicationStack(app, 'UnicornRentalComplexApplicationStack', {
  env,
  network: networkStack.resources,
  solution: solutionStack.resources,
  settings,
  stackName: buildStackName(settings, 'UnicornRentalComplexApplicationStack'),
  description: 'Spring Boot app and S3 artifact bootstrap resources',
});

app.synth();
