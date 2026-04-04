#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { loadBootstrapSettings } from '../lib/bootstrap/settings';
import { UnicornRentalAccessStack } from '../lib/stacks/unicorn-rental-access-stack';
import { UnicornRentalApplicationStack } from '../lib/stacks/unicorn-rental-application-stack';
import { UnicornRentalNetworkStack } from '../lib/stacks/unicorn-rental-network-stack';

const app = new cdk.App();
const settings = loadBootstrapSettings(app);
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2',
};

const networkStack = new UnicornRentalNetworkStack(app, 'UnicornRentalNetworkStack', {
  env,
  settings,
  description: 'Dedicated GameDay VPC and network boundary',
});

const accessStack = new UnicornRentalAccessStack(app, 'UnicornRentalAccessStack', {
  env,
  network: networkStack.resources,
  settings,
  description: 'Restricted operator user and CloudFormation execution role',
});

const applicationStack = new UnicornRentalApplicationStack(app, 'UnicornRentalApplicationStack', {
  env,
  network: networkStack.resources,
  settings,
  description: 'Costful application resources deployed only when needed',
});
applicationStack.addDependency(
  accessStack,
  'Deploy application resources after low-cost network and access scaffolding',
);

app.synth();
