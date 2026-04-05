import * as cdk from 'aws-cdk-lib';
import { UnicornRentalInfraStack } from '../lib/infra-stack';

const app = new cdk.App();
new UnicornRentalInfraStack(app, 'UnicornRentalInfraStack', {
  env: { account: '807876133169', region: 'ap-northeast-2' },
});
