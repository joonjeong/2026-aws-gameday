import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

interface BootstrapUserDataProps {
  appDirectory: string;
  awsRegion: string;
  instanceRole: iam.IGrantable;
  serviceName: string;
  tableName: string;
}

export function createBootstrapUserData(
  scope: cdk.Stack,
  props: BootstrapUserDataProps,
): ec2.UserData {
  const userData = ec2.UserData.forLinux();
  const appSourcePath = resolveUserDataAssetPath('UnicornRentalApp.java');
  const appSourceLocalPath = `${props.appDirectory}/UnicornRentalApp.java`;
  const envFileLocalPath = `/etc/${props.serviceName}.env`;
  const serviceUnitLocalPath = `/etc/systemd/system/${props.serviceName}.service`;
  const serviceEnvironment = renderTemplate(readUserDataAsset('service.env.tmpl'), {
    AWS_REGION: props.awsRegion,
    TABLE_NAME: props.tableName,
  });
  const serviceUnit = renderTemplate(readUserDataAsset('service.service.tmpl'), {
    APP_DIRECTORY: props.appDirectory,
    ENV_FILE_PATH: envFileLocalPath,
  });
  const bootstrapScript = renderTemplate(readUserDataAsset('bootstrap.sh.tmpl'), {
    APP_DIRECTORY: props.appDirectory,
    APP_SOURCE_PATH: appSourceLocalPath,
    ENV_FILE_PATH: envFileLocalPath,
    SERVICE_NAME: props.serviceName,
    SERVICE_UNIT_PATH: serviceUnitLocalPath,
  });
  const appSourceAsset = new s3assets.Asset(scope, 'BootstrapApplicationSourceAsset', {
    path: appSourcePath,
    readers: [props.instanceRole],
  });
  const serviceEnvironmentAsset = new s3assets.Asset(scope, 'BootstrapEnvironmentAsset', {
    path: writeRenderedAsset('service.env', serviceEnvironment, 0o600),
    readers: [props.instanceRole],
  });
  const serviceUnitAsset = new s3assets.Asset(scope, 'BootstrapServiceUnitAsset', {
    path: writeRenderedAsset('service.service', serviceUnit, 0o644),
    readers: [props.instanceRole],
  });
  const bootstrapScriptAsset = new s3assets.Asset(scope, 'BootstrapScriptAsset', {
    path: writeRenderedAsset('bootstrap.sh', bootstrapScript, 0o755),
    readers: [props.instanceRole],
  });
  userData.addCommands('set -euo pipefail');
  userData.addS3DownloadCommand({
    bucket: appSourceAsset.bucket,
    bucketKey: appSourceAsset.s3ObjectKey,
    localFile: appSourceLocalPath,
    region: props.awsRegion,
  });
  userData.addS3DownloadCommand({
    bucket: serviceEnvironmentAsset.bucket,
    bucketKey: serviceEnvironmentAsset.s3ObjectKey,
    localFile: envFileLocalPath,
    region: props.awsRegion,
  });
  userData.addS3DownloadCommand({
    bucket: serviceUnitAsset.bucket,
    bucketKey: serviceUnitAsset.s3ObjectKey,
    localFile: serviceUnitLocalPath,
    region: props.awsRegion,
  });
  const localScriptPath = userData.addS3DownloadCommand({
    bucket: bootstrapScriptAsset.bucket,
    bucketKey: bootstrapScriptAsset.s3ObjectKey,
    localFile: '/tmp/unicorn-rental-bootstrap.sh',
    region: props.awsRegion,
  });

  userData.addExecuteFileCommand({
    filePath: localScriptPath,
  });
  return userData;
}

function readUserDataAsset(fileName: string): string {
  return fs.readFileSync(resolveUserDataAssetPath(fileName), 'utf8');
}

function resolveUserDataAssetPath(fileName: string): string {
  for (const candidate of resolveUserDataRoots()) {
    const filePath = path.join(candidate, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  throw new Error(`userdata asset not found: ${fileName}`);
}

function resolveUserDataRoots(): string[] {
  return [
    path.resolve(process.cwd(), 'userdata'),
    path.resolve(__dirname, '..', '..', 'userdata'),
    path.resolve(__dirname, '..', '..', '..', 'userdata'),
  ];
}

function writeRenderedAsset(fileName: string, contents: string, mode: number): string {
  const assetDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'unicorn-rental-bootstrap-asset-'),
  );
  const assetPath = path.join(assetDirectory, fileName);
  fs.writeFileSync(assetPath, contents, {
    mode,
  });
  return assetPath;
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.replaceAll(`{{${key}}}`, value);
  }, template);
}
