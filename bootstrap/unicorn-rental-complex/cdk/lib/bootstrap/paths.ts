import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function resolveProjectRoot(): string {
  const candidates = [
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), '..'),
    path.resolve(__dirname, '..', '..', '..'),
    path.resolve(__dirname, '..', '..', '..', '..'),
  ];

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, 'app'))
      && fs.existsSync(path.join(candidate, 'cdk'))
    ) {
      return candidate;
    }
  }

  throw new Error('Could not resolve the unicorn-rental-complex project root.');
}

export function resolveAppDirectory(): string {
  const appDirectory = path.join(resolveProjectRoot(), 'app');
  if (!fs.existsSync(appDirectory)) {
    throw new Error(`App directory not found: ${appDirectory}`);
  }
  return appDirectory;
}

export function resolveAppArtifactPath(fileName: string): string {
  const artifactPath = path.join(resolveAppDirectory(), 'build', 'libs', fileName);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Built app artifact not found at ${artifactPath}. Run "../app/gradlew bootJar" before synthesizing the CDK app.`,
    );
  }
  return artifactPath;
}

export function resolveUserDataAssetPath(fileName: string): string {
  const assetPath = path.join(resolveProjectRoot(), 'cdk', 'userdata', fileName);
  if (!fs.existsSync(assetPath)) {
    throw new Error(`userdata asset not found: ${assetPath}`);
  }
  return assetPath;
}

export function stageSingleFileDirectory(prefix: string, sourcePath: string, fileName: string): string {
  const stagingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.copyFileSync(sourcePath, path.join(stagingDirectory, fileName));
  return stagingDirectory;
}
