#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { UnicornRentalBootstrapStack } from '../lib/stacks/unicorn-rental-bootstrap-stack';

const app = new cdk.App();

new UnicornRentalBootstrapStack(app, 'UnicornRentalBootstrapStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2',
  },
  description: 'Isolated bootstrap infrastructure for AWS GameDay drift and migration exercises',
});

app.synth();

