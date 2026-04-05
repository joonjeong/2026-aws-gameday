const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cdk = require('aws-cdk-lib');
const { EnigmaTrafficStack } = require('../dist/lib/stacks/enigma-traffic-stack');

function createSettings() {
  return {
    projectName: 'enigma',
    targetBaseUrl: 'http://unicorn-rental-alb.example.com',
    targetTimeoutMs: 3000,
    baselineEnabled: true,
    anomalyEnabled: true,
    baselineScheduleExpression: 'rate(5 minutes)',
    anomalyScheduleExpression: 'cron(0 */6 * * ? *)',
    scheduleTimezone: 'Asia/Seoul',
    anomalyFlexibleWindowMinutes: 60,
    baselineCpu: 256,
    baselineMemoryMiB: 512,
    anomalyCpu: 1024,
    anomalyMemoryMiB: 2048,
  };
}

function synthTemplate() {
  const app = new cdk.App();
  const stack = new EnigmaTrafficStack(app, 'EnigmaTrafficStack', {
    env: {
      account: '123456789012',
      region: 'ap-northeast-2',
    },
    settings: createSettings(),
  });

  return stack._toCloudFormation();
}

function findResources(template, type) {
  return Object.values(template.Resources ?? {}).filter((resource) => resource.Type === type);
}

function findResource(template, predicate) {
  for (const resource of Object.values(template.Resources ?? {})) {
    if (predicate(resource)) {
      return resource;
    }
  }

  return undefined;
}

test('traffic stack keeps the injector VPC simple with public subnets only', () => {
  const template = synthTemplate();

  assert.equal(findResources(template, 'AWS::EC2::NatGateway').length, 0);
  assert.equal(findResources(template, 'AWS::EC2::Subnet').length, 2);
  assert.equal(findResources(template, 'AWS::EC2::InternetGateway').length, 1);
});

test('traffic stack schedules separate baseline and anomaly ECS tasks', () => {
  const template = synthTemplate();
  const schedules = findResources(template, 'AWS::Scheduler::Schedule');

  assert.equal(schedules.length, 2);

  const baselineSchedule = schedules.find((resource) => resource.Properties?.Name === 'enigma-baseline');
  const anomalySchedule = schedules.find((resource) => resource.Properties?.Name === 'enigma-anomaly');

  assert.ok(baselineSchedule, 'expected a baseline schedule');
  assert.equal(baselineSchedule.Properties.FlexibleTimeWindow.Mode, 'OFF');
  assert.equal(
    baselineSchedule.Properties.Target.EcsParameters.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp,
    'ENABLED',
  );

  assert.ok(anomalySchedule, 'expected an anomaly schedule');
  assert.equal(anomalySchedule.Properties.FlexibleTimeWindow.Mode, 'FLEXIBLE');
  assert.equal(anomalySchedule.Properties.FlexibleTimeWindow.MaximumWindowInMinutes, 60);
});

test('baseline and anomaly task definitions point to distinct k6 scripts', () => {
  const template = synthTemplate();
  const taskDefinitions = findResources(template, 'AWS::ECS::TaskDefinition');

  assert.equal(taskDefinitions.length, 2);

  const commands = taskDefinitions.map(
    (resource) => resource.Properties.ContainerDefinitions[0].Command.join(' '),
  );

  assert.ok(commands.includes('run /scripts/baseline.js'));
  assert.ok(commands.includes('run /scripts/anomaly.js'));
});

test('k6 assets copy both baseline and anomaly scripts into the runner image', () => {
  const dockerfile = fs.readFileSync('docker/k6-runner/Dockerfile', 'utf8');
  const baselineScript = fs.readFileSync('scripts/baseline.js', 'utf8');
  const anomalyScript = fs.readFileSync('scripts/anomaly.js', 'utf8');
  const trafficSource = fs.readFileSync('lib/enigma/traffic.ts', 'utf8');

  assert.match(dockerfile, /^FROM grafana\/k6:0\.49\.0/m);
  assert.match(dockerfile, /^COPY scripts \/scripts$/m);
  assert.match(baselineScript, /\/api\/orders\/create/);
  assert.match(anomalyScript, /invalidRequests/);
  assert.match(anomalyScript, /contentionSpike/);
  assert.match(anomalyScript, /rate:\s*24/);
  assert.match(anomalyScript, /target:\s*64/);
  assert.match(anomalyScript, /anomaly_http_responses/);
  assert.doesNotMatch(baselineScript, /\?\./);
  assert.doesNotMatch(anomalyScript, /\?\./);
  assert.match(trafficSource, /platform:\s*ecrAssets\.Platform\.LINUX_AMD64/);
});

test('stack outputs expose the operational entry points for schedules and logs', () => {
  const template = synthTemplate();

  assert.ok(template.Outputs?.TrafficClusterName, 'expected an ECS cluster output');
  assert.ok(template.Outputs?.TrafficPublicSubnetIds, 'expected public subnet outputs');
  assert.ok(template.Outputs?.TrafficTaskSecurityGroupId, 'expected a task security group output');
  assert.ok(template.Outputs?.BaselineScheduleName, 'expected a baseline schedule output');
  assert.ok(template.Outputs?.AnomalyScheduleName, 'expected an anomaly schedule output');
  assert.ok(template.Outputs?.BaselineLogGroupName, 'expected a baseline log group output');
  assert.ok(template.Outputs?.AnomalyLogGroupName, 'expected an anomaly log group output');

  const schedulerRole = findResource(
    template,
    (resource) => resource.Type === 'AWS::IAM::Role' && resource.Properties?.RoleName === 'enigma-scheduler-role',
  );
  assert.ok(schedulerRole, 'expected a dedicated scheduler role');
});
