import * as cdk from 'aws-cdk-lib';
import { UnicornRentalInfraStack } from '../lib/infra-stack';
import { UnicornRentalEcsNetworkStack } from '../lib/ecs-network-stack';
import { UnicornRentalEcsStack } from '../lib/ecs-stack';

const app = new cdk.App();

new UnicornRentalInfraStack(app, 'UnicornRentalInfraStack', {
  env: { account: '807876133169', region: 'ap-northeast-2' },
});

new UnicornRentalEcsNetworkStack(app, 'UnicornRentalEcsNetworkStack', {
  env: { account: '807876133169', region: 'ap-northeast-2' },
});

new UnicornRentalEcsStack(app, 'UnicornRentalEcsStack', {
  env: { account: '807876133169', region: 'ap-northeast-2' },
});
