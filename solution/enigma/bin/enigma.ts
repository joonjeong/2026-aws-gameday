#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { buildStackName, loadEnigmaSettings } from '../lib/enigma/settings';
import { EnigmaTrafficStack } from '../lib/stacks/enigma-traffic-stack';

const app = new cdk.App();
const settings = loadEnigmaSettings(app);
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2',
};

new EnigmaTrafficStack(app, 'EnigmaTrafficStack', {
  env,
  settings,
  stackName: buildStackName(settings, 'EnigmaTrafficStack'),
  description: 'Scheduled k6 traffic injection for unicorn-rental-init',
});

app.synth();

