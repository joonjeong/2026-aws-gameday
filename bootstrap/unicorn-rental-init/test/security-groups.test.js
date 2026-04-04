const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cdk = require('aws-cdk-lib');
const { UnicornRentalApplicationStack } = require('../dist/lib/stacks/unicorn-rental-application-stack');
const { UnicornRentalNetworkStack } = require('../dist/lib/stacks/unicorn-rental-network-stack');

function createAppResources(app) {
  const settings = {
    projectName: 'unicorn-rental',
    instanceType: 't3.small',
    desiredCapacity: 2,
    minCapacity: 2,
    maxCapacity: 4,
    healthCheckPath: '/actuator/health',
  };
  const env = {
    account: '123456789012',
    region: 'ap-northeast-2',
  };

  const networkStack = new UnicornRentalNetworkStack(app, 'UnicornRentalNetworkStack', {
    env,
    settings,
  });
  const applicationStack = new UnicornRentalApplicationStack(app, 'UnicornRentalApplicationStack', {
    env,
    network: networkStack.resources,
    settings,
  });

  return {
    networkStack,
    applicationStack,
  };
}

function synthTemplates() {
  const app = new cdk.App();
  const { networkStack, applicationStack } = createAppResources(app);

  return {
    network: networkStack._toCloudFormation(),
    application: applicationStack._toCloudFormation(),
  };
}

function synthToTempOutdir() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'unicorn-rental-cdk-out-'));
  const app = new cdk.App({ outdir });
  createAppResources(app);
  app.synth();
  return outdir;
}

function findResource(template, predicate) {
  for (const resource of Object.values(template.Resources ?? {})) {
    if (predicate(resource)) {
      return resource;
    }
  }

  return undefined;
}

function countResources(template, predicate) {
  let count = 0;

  for (const resource of Object.values(template.Resources ?? {})) {
    if (predicate(resource)) {
      count += 1;
    }
  }

  return count;
}

test('workload security groups are owned by the application stack', () => {
  const templates = synthTemplates();

  assert.equal(
    countResources(templates.network, (resource) => resource.Type === 'AWS::EC2::SecurityGroup'),
    0,
  );
  assert.equal(
    countResources(
      templates.application,
      (resource) => resource.Type === 'AWS::EC2::SecurityGroup',
    ),
    2,
  );
});

test('application stack can synthesize without the access stack', () => {
  const templates = synthTemplates();

  const loadBalancer = findResource(
    templates.application,
    (resource) => resource.Type === 'AWS::ElasticLoadBalancingV2::LoadBalancer',
  );
  const asg = findResource(
    templates.application,
    (resource) => resource.Type === 'AWS::AutoScaling::AutoScalingGroup',
  );

  assert.ok(loadBalancer, 'expected an application load balancer without the access stack');
  assert.ok(asg, 'expected an autoscaling group without the access stack');
  assert.ok(
    findResource(
      templates.application,
      (resource) => resource.Type === 'AWS::EC2::LaunchTemplate',
    ),
    'expected a launch template for the autoscaling group',
  );
  assert.equal(
    countResources(
      templates.application,
      (resource) => resource.Type === 'AWS::AutoScaling::LaunchConfiguration',
    ),
    0,
  );
});

test('autoscaling group references a launch template instead of a launch configuration', () => {
  const templates = synthTemplates();

  const asg = findResource(
    templates.application,
    (resource) => resource.Type === 'AWS::AutoScaling::AutoScalingGroup',
  );

  assert.ok(asg, 'expected an autoscaling group');
  assert.ok(asg.Properties.LaunchTemplate, 'expected launch template settings on the autoscaling group');
  assert.equal(asg.Properties.LaunchConfigurationName, undefined);
});

test('bootstrap security groups preserve public ALB and app ingress behavior', () => {
  const templates = synthTemplates();

  const albSecurityGroup = findResource(
    templates.application,
    (resource) =>
      resource.Type === 'AWS::EC2::SecurityGroup'
      && resource.Properties?.GroupDescription === 'Security group for the public ALB',
  );
  assert.ok(albSecurityGroup, 'expected an ALB security group');
  assert.deepEqual(albSecurityGroup.Properties.SecurityGroupIngress, [
    {
      CidrIp: '0.0.0.0/0',
      Description: 'Allow HTTP',
      FromPort: 80,
      IpProtocol: 'tcp',
      ToPort: 80,
    },
  ]);

  const appSecurityGroup = findResource(
    templates.application,
    (resource) =>
      resource.Type === 'AWS::EC2::SecurityGroup'
      && resource.Properties?.GroupDescription === 'Security group for the Java workload',
  );
  assert.ok(appSecurityGroup, 'expected an application security group');
  assert.deepEqual(appSecurityGroup.Properties.SecurityGroupIngress, [
    {
      CidrIp: '0.0.0.0/0',
      Description: 'Allow SSH from the internet for bootstrap simulation',
      FromPort: 22,
      IpProtocol: 'tcp',
      ToPort: 22,
    },
  ]);

  const albToAppIngressRule = findResource(
    templates.application,
    (resource) =>
      resource.Type === 'AWS::EC2::SecurityGroupIngress'
      && resource.Properties?.Description === 'Allow ALB to reach the Java workload'
      && resource.Properties?.FromPort === 8080
      && resource.Properties?.ToPort === 8080
      && resource.Properties?.IpProtocol === 'tcp',
  );
  assert.ok(albToAppIngressRule, 'expected an ALB-to-application ingress rule');
});

test('application user data downloads the app, env, service, and bootstrap assets', () => {
  const templates = synthTemplates();
  const launchTemplate = findResource(
    templates.application,
    (resource) => resource.Type === 'AWS::EC2::LaunchTemplate',
  );
  const userData = launchTemplate?.Properties?.LaunchTemplateData?.UserData?.['Fn::Base64'];
  const templateJson = JSON.stringify(templates.application);

  assert.ok(userData, 'expected launch template user data');
  assert.equal((userData.match(/aws s3 cp/g) ?? []).length, 4);
  assert.match(userData, /unicorn-rental-bootstrap\.sh/);
  assert.match(userData, /\/opt\/unicorn-rental\/app\/UnicornRentalApp\.java/);
  assert.match(userData, /\/etc\/unicorn-rental\.env/);
  assert.match(userData, /\/etc\/systemd\/system\/unicorn-rental\.service/);
  assert.doesNotMatch(templateJson, /import com\.sun\.net\.httpserver\.HttpExchange;/);
});

test('bootstrap script installs awscli because the app shells out to aws dynamodb', () => {
  const bootstrapScript = fs.readFileSync('userdata/bootstrap.sh.tmpl', 'utf8');
  const appSource = fs.readFileSync('userdata/UnicornRentalApp.java', 'utf8');

  assert.match(appSource, /"aws",\s*"dynamodb"/);
  assert.match(bootstrapScript, /dnf install -y awscli java-21-amazon-corretto-devel/);
  assert.match(bootstrapScript, /command -v aws/);
});

test('rendered env asset uses the resolved table name instead of a token placeholder', () => {
  const outdir = synthToTempOutdir();
  const envAssetName = fs.readdirSync(outdir).find((fileName) => fileName.endsWith('.env'));

  assert.ok(envAssetName, 'expected a rendered env asset in the synth output');

  const envAsset = fs.readFileSync(path.join(outdir, envAssetName), 'utf8');
  assert.match(envAsset, /^TABLE_NAME=unicorn-rental-orders$/m);
  assert.doesNotMatch(envAsset, /\$\{Token\[TOKEN\./);
});

test('application outputs expose the SSM parameter name but not the private key material', () => {
  const templates = synthTemplates();

  assert.ok(
    templates.application.Outputs?.Ec2PrivateKeyParameterName,
    'expected an output for the private key parameter name',
  );
  assert.equal(templates.application.Outputs?.Ec2PrivateKeyMaterial, undefined);
});
