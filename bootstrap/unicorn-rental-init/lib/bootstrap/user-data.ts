import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface BootstrapUserDataProps {
  appDirectory: string;
  awsRegion: string;
  projectName: string;
  serviceName: string;
  tableName: string;
}

export function createBootstrapUserData(
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

  userData.addCommands(bootstrapScript);
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

function renderTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.replaceAll(`{{${key}}}`, value);
  }, template);
}
