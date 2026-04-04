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
  projectName: string;
  serviceName: string;
  tableName: string;
}

export function createBootstrapUserData(
  scope: cdk.Stack,
  props: BootstrapUserDataProps,
): ec2.UserData {
  const userData = ec2.UserData.forLinux();
  const javaSource = readUserDataAsset('UnicornRentalApp.java');
  const bootstrapScript = renderTemplate(readUserDataAsset('bootstrap.sh.tmpl'), {
    APP_DIRECTORY: props.appDirectory,
    AWS_REGION: props.awsRegion,
    JAVA_SOURCE: javaSource,
    PROJECT_NAME: props.projectName,
    SERVICE_NAME: props.serviceName,
    TABLE_NAME: props.tableName,
  });
  const bootstrapScriptAsset = new s3assets.Asset(scope, 'BootstrapScriptAsset', {
    path: writeBootstrapScriptAsset(bootstrapScript),
    readers: [props.instanceRole],
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
  for (const candidate of resolveUserDataRoots()) {
    const filePath = path.join(candidate, fileName);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
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

function writeBootstrapScriptAsset(bootstrapScript: string): string {
  const scriptDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'unicorn-rental-bootstrap-script-'),
  );
  const scriptPath = path.join(scriptDirectory, 'bootstrap.sh');
  fs.writeFileSync(scriptPath, bootstrapScript, {
    mode: 0o755,
  });
  return scriptPath;
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.replaceAll(`{{${key}}}`, value);
  }, template);
}
