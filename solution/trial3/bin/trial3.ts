#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

new MonitoringStack(app, 'UnicornRentalMonitoringStack', {
  env: {
    account: '075647413732',
    region: 'ap-northeast-2',
  },
  description: 'CloudWatch 대시보드 + 알람 + SNS for Unicorn Rental Complex',
  stackName: 'UnicornRentalMonitoringStack',
});
