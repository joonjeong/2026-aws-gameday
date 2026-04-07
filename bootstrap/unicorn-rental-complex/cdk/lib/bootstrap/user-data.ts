import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as fs from 'node:fs';
import { resolveUserDataAssetPath } from './paths';

interface BootstrapUserDataProps {
  appDirectory: string;
  artifactBucket: s3.IBucket;
  artifactObjectKey: string;
  artifactFileName: string;
  awsRegion: string;
  databaseEndpointAddress: string;
  databaseName: string;
  databaseSecretArn: string;
  databaseUsername: string;
  serviceName: string;
  sessionTableName: string;
  sessionTtlHours: number;
}

export function createBootstrapUserData(
  _scope: cdk.Stack,
  props: BootstrapUserDataProps,
): ec2.UserData {
  const userData = ec2.UserData.forLinux();
  const artifactLocalPath = `${props.appDirectory}/${props.artifactFileName}`;
  const envFileLocalPath = `/etc/${props.serviceName}.env`;
  const serviceUnitLocalPath = `/etc/systemd/system/${props.serviceName}.service`;
  const serviceEnvironment = renderTemplate(readUserDataAsset('service.env.tmpl'), {
    AWS_REGION: props.awsRegion,
    DB_HOST: props.databaseEndpointAddress,
    DB_NAME: props.databaseName,
    DB_USERNAME: props.databaseUsername,
    SESSION_TABLE_NAME: props.sessionTableName,
    SESSION_TTL_HOURS: props.sessionTtlHours.toString(),
  });
  const serviceUnit = renderTemplate(readUserDataAsset('service.service.tmpl'), {
    APP_DIRECTORY: props.appDirectory,
    ARTIFACT_PATH: artifactLocalPath,
    ENV_FILE_PATH: envFileLocalPath,
  });
  const bootstrapScript = renderTemplate(readUserDataAsset('bootstrap.sh.tmpl'), {
    APP_DIRECTORY: props.appDirectory,
    ARTIFACT_PATH: artifactLocalPath,
    DB_SECRET_ARN: props.databaseSecretArn,
    ENV_FILE_PATH: envFileLocalPath,
    SERVICE_NAME: props.serviceName,
    SERVICE_UNIT_PATH: serviceUnitLocalPath,
  });
  userData.addCommands('set -euo pipefail');
  userData.addS3DownloadCommand({
    bucket: props.artifactBucket,
    bucketKey: props.artifactObjectKey,
    localFile: artifactLocalPath,
    region: props.awsRegion,
  });
  addFileCommand(userData, envFileLocalPath, serviceEnvironment, '600');
  addFileCommand(userData, serviceUnitLocalPath, serviceUnit, '644');
  const localScriptPath = '/tmp/unicorn-rental-bootstrap.sh';
  addFileCommand(userData, localScriptPath, bootstrapScript, '755');

  userData.addExecuteFileCommand({
    filePath: localScriptPath,
  });
  return userData;
}

function readUserDataAsset(fileName: string): string {
  return fs.readFileSync(resolveUserDataAssetPath(fileName), 'utf8');
}

function addFileCommand(
  userData: ec2.UserData,
  filePath: string,
  contents: string,
  mode: string,
): void {
  userData.addCommands(
    `mkdir -p "$(dirname '${filePath}')"`,
    `cat <<'EOF' > '${filePath}'`,
    contents,
    'EOF',
    `chmod ${mode} '${filePath}'`,
  );
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.replaceAll(`{{${key}}}`, value);
  }, template);
}
