const assert = require('node:assert/strict');
const test = require('node:test');
const cdk = require('aws-cdk-lib');
const { Template } = require('aws-cdk-lib/assertions');
const { UnicornRentalMonitorStack } = require('../lib/unicorn-rental-monitor-stack');

test('creates a task 0 dashboard skeleton with non-filtered layer searches', () => {
  const app = new cdk.App();
  const stack = new UnicornRentalMonitorStack(app, 'TestMonitorStack', {
    dashboardName: 'task0-test-dashboard',
  });

  const template = Template.fromStack(stack).toJSON();
  const dashboardResource = Object.values(template.Resources).find(
    (resource) => resource.Type === 'AWS::CloudWatch::Dashboard',
  );

  assert.ok(dashboardResource, 'dashboard resource should exist');
  assert.equal(dashboardResource.Properties.DashboardName, 'task0-test-dashboard');

  const body = JSON.stringify(dashboardResource.Properties.DashboardBody);

  assert.match(body, /AWS\/ApplicationELB,LoadBalancer/);
  assert.match(body, /AWS\/EC2,InstanceId/);
  assert.match(body, /AWS\/ECS,ClusterName,ServiceName/);
  assert.match(body, /AWS\/DynamoDB,TableName/);
  assert.match(body, /AWS\/RDS,DBInstanceIdentifier/);
  assert.match(body, /SEARCH\('/);
  assert.match(body, /do not pin to a single named resource/);
  assert.doesNotMatch(body, /All ALB RequestCount/);
});
