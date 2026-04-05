#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { UnicornRentalObservabilityStack } from '../lib/observability-stack';
import { UnicornRentalNetworkExtStack } from '../lib/network-ext-stack';
import { UnicornRentalFargateStack } from '../lib/fargate-stack';

const app = new cdk.App();
const env = { account: '807876133169', region: 'ap-northeast-2' };

new UnicornRentalObservabilityStack(app, 'UnicornRentalObservabilityStack', { env });
new UnicornRentalNetworkExtStack(app, 'UnicornRentalNetworkExtStack', { env });
new UnicornRentalFargateStack(app, 'UnicornRentalFargateStack', { env });
