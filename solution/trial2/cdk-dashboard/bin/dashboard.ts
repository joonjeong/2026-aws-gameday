import * as cdk from 'aws-cdk-lib';
import { DashboardStack } from '../lib/dashboard-stack';

const app = new cdk.App();
new DashboardStack(app, 'UnicornRentalDashboardStack', {
  env: { account: '807876133169', region: 'ap-northeast-2' },
});
