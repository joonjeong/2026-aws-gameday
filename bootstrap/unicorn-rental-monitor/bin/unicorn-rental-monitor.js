#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { UnicornRentalMonitorStack } = require('../lib/unicorn-rental-monitor-stack');

const app = new cdk.App();
const dashboardName = app.node.tryGetContext('dashboardName') ?? 'unicorn-rental-task0-overview';

new UnicornRentalMonitorStack(app, 'UnicornRentalMonitorStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2',
  },
  dashboardName,
  description: 'Task 0 baseline dashboard skeleton for ALB, EC2, ECS, DynamoDB, and RDS',
});

app.synth();
