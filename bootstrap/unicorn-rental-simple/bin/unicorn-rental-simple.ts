#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { buildStackName, loadBootstrapSettings } from '../lib/bootstrap/settings';
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
  stackName: buildStackName(settings, 'UnicornRentalNetworkStack'),
  description: 'Dedicated GameDay VPC and network boundary',
});

const applicationStack = new UnicornRentalApplicationStack(app, 'UnicornRentalApplicationStack', {
  env,
  network: networkStack.resources,
  settings,
  stackName: buildStackName(settings, 'UnicornRentalApplicationStack'),
  description: 'Costful application resources deployed only when needed',
});

app.synth();
