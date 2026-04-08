const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cdk = require('aws-cdk-lib');
const { UnicornRentalApplicationStack } = require('../dist/lib/stacks/unicorn-rental-application-stack');
const { UnicornRentalNetworkStack } = require('../dist/lib/stacks/unicorn-rental-network-stack');

const ARTIFACT_FILE_NAME = 'unicorn-rental-complex-app.jar';

function prepareBuiltArtifact() {
  const artifactDirectory = path.join(__dirname, '..', '..', 'app', 'build', 'libs');
  const artifactPath = path.join(artifactDirectory, ARTIFACT_FILE_NAME);
  fs.mkdirSync(artifactDirectory, { recursive: true });
  if (!fs.existsSync(artifactPath)) {
    fs.writeFileSync(artifactPath, 'placeholder bootJar');
  }
  return artifactPath;
}

function createAppResources(app) {
  prepareBuiltArtifact();

  const settings = {
    projectName: 'unicorn-rental-complex',
    instanceType: 't3.small',
    databaseInstanceType: 't3.micro',
    desiredCapacity: 2,
    minCapacity: 2,
    maxCapacity: 4,
    healthCheckPath: '/actuator/health',
    databaseName: 'unicorn_rental',
    databaseUsername: 'unicorn_app',
    artifactFileName: ARTIFACT_FILE_NAME,
    sessionTtlHours: 8,
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

test('network stack exposes both public and private subnet outputs', () => {
  const templates = synthTemplates();

  assert.ok(templates.network.Outputs?.PublicSubnetIds, 'expected public subnet outputs');
  assert.ok(templates.network.Outputs?.PrivateSubnetIds, 'expected private subnet outputs');
});

test('application stack provisions launch template, postgres, session table, artifact bucket, and deployments', () => {
  const templates = synthTemplates();

  assert.ok(
    findResource(
      templates.application,
      (resource) => resource.Type === 'AWS::EC2::LaunchTemplate',
    ),
    'expected a launch template for the autoscaling group',
  );
  assert.ok(
    findResource(
      templates.application,
      (resource) => resource.Type === 'AWS::RDS::DBInstance',
    ),
    'expected a private Postgres instance',
  );
  const database = findResource(
    templates.application,
    (resource) => resource.Type === 'AWS::RDS::DBInstance',
  );
  assert.equal(database?.Properties?.EngineVersion, '16.12');
  assert.ok(
    findResource(
      templates.application,
      (resource) => resource.Type === 'AWS::DynamoDB::Table',
    ),
    'expected a DynamoDB session table',
  );
  assert.ok(
    findResource(
      templates.application,
      (resource) => resource.Type === 'AWS::S3::Bucket',
    ),
    'expected an S3 bucket for source and artifact uploads',
  );
  assert.equal(
    countResources(
      templates.application,
      (resource) => resource.Type === 'Custom::CDKBucketDeployment',
    ),
    2,
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

test('bootstrap security groups preserve public ALB, public app, and private database behavior', () => {
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
      && resource.Properties?.GroupDescription === 'Security group for the public Spring Boot workload',
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

  const appToDatabaseIngressRule = findResource(
    templates.application,
    (resource) =>
      resource.Type === 'AWS::EC2::SecurityGroupIngress'
      && resource.Properties?.Description === 'Allow app instances to reach Postgres'
      && resource.Properties?.FromPort === 5432
      && resource.Properties?.ToPort === 5432
      && resource.Properties?.IpProtocol === 'tcp',
  );
  assert.ok(appToDatabaseIngressRule, 'expected an application-to-database ingress rule');
});

test('application user data downloads the jar artifact and renders local runtime files', () => {
  const templates = synthTemplates();
  const launchTemplate = findResource(
    templates.application,
    (resource) => resource.Type === 'AWS::EC2::LaunchTemplate',
  );
  const userData = JSON.stringify(launchTemplate?.Properties?.LaunchTemplateData?.UserData);
  const templateJson = JSON.stringify(templates.application);

  assert.ok(userData, 'expected launch template user data');
  assert.equal((userData.match(/aws s3 cp/g) ?? []).length, 1);
  assert.match(userData, /unicorn-rental-complex-app\.jar/);
  assert.match(userData, /\/etc\/unicorn-rental-complex\.env/);
  assert.match(userData, /\/etc\/systemd\/system\/unicorn-rental-complex\.service/);
  assert.match(userData, /SPRING_DATASOURCE_URL=jdbc:postgresql:\/\//);
  assert.match(userData, /SESSION_TABLE_NAME=/);
  assert.match(userData, /SessionTable/);
  assert.doesNotMatch(userData, /javac/);
  assert.doesNotMatch(templateJson, /UnicornRentalApp\.java/);
});

test('bootstrap templates install jq and read Secrets Manager before starting the jar', () => {
  const bootstrapScript = fs.readFileSync(path.join(__dirname, '..', 'userdata', 'bootstrap.sh.tmpl'), 'utf8');
  const serviceUnit = fs.readFileSync(path.join(__dirname, '..', 'userdata', 'service.service.tmpl'), 'utf8');
  const serviceEnv = fs.readFileSync(path.join(__dirname, '..', 'userdata', 'service.env.tmpl'), 'utf8');

  assert.match(bootstrapScript, /dnf install -y awscli jq java-17-amazon-corretto-headless/);
  assert.match(bootstrapScript, /aws secretsmanager get-secret-value/);
  assert.match(serviceUnit, /ExecStart=\/usr\/bin\/java .* -jar \{\{ARTIFACT_PATH\}\}/);
  assert.match(serviceEnv, /^SPRING_DATASOURCE_URL=jdbc:postgresql:\/\/\{\{DB_HOST\}\}:5432\/\{\{DB_NAME\}\}$/m);
  assert.match(serviceEnv, /^SESSION_TABLE_NAME=\{\{SESSION_TABLE_NAME\}\}$/m);
});

test('application outputs expose the database, bucket, and SSM key metadata but not private key material', () => {
  const templates = synthTemplates();

  assert.ok(templates.application.Outputs?.DatabaseEndpointAddress);
  assert.ok(templates.application.Outputs?.ArtifactBucketName);
  assert.ok(templates.application.Outputs?.ArtifactObjectKey);
  assert.ok(templates.application.Outputs?.Ec2PrivateKeyParameterName);
  assert.equal(templates.application.Outputs?.Ec2PrivateKeyMaterial, undefined);
});
