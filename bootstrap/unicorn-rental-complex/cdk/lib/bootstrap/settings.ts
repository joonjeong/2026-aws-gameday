import * as cdk from 'aws-cdk-lib';
import { BootstrapSettings } from './types';

const RESOURCE_PREFIX_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

interface ResourceNameOptions {
  label?: string;
  maxLength?: number;
}

export function loadBootstrapSettings(app: cdk.App): BootstrapSettings {
  const settings = {
    resourcePrefix: readOptionalString(app, 'resourcePrefix'),
    projectName: readString(app, 'projectName', 'unicorn-rental-complex'),
    instanceType: readString(app, 'instanceType', 't3.small'),
    databaseInstanceType: readString(app, 'databaseInstanceType', 't3.micro'),
    desiredCapacity: readNumber(app, 'desiredCapacity', 2),
    minCapacity: readNumber(app, 'minCapacity', 2),
    maxCapacity: readNumber(app, 'maxCapacity', 4),
    healthCheckPath: readString(app, 'healthCheckPath', '/actuator/health'),
    databaseName: readString(app, 'databaseName', 'unicorn_rental'),
    databaseUsername: readString(app, 'databaseUsername', 'unicorn_app'),
    artifactFileName: readString(app, 'artifactFileName', 'unicorn-rental-complex-app.jar'),
    sessionTtlHours: readNumber(app, 'sessionTtlHours', 8),
  };

  validateBootstrapSettings(settings);

  return settings;
}

export function applyBootstrapTags(scope: cdk.Stack, settings: BootstrapSettings): void {
  cdk.Tags.of(scope).add('Project', settings.projectName);
  cdk.Tags.of(scope).add('ManagedBy', 'cloudformation');
  cdk.Tags.of(scope).add('Purpose', 'gameday-bootstrap');

  if (settings.resourcePrefix) {
    cdk.Tags.of(scope).add('ResourcePrefix', settings.resourcePrefix);
  }
}

export function buildResourceName(
  settings: BootstrapSettings,
  baseName: string,
  options: ResourceNameOptions = {},
): string {
  const effectiveName = settings.resourcePrefix
    ? `${settings.resourcePrefix}-${baseName}`
    : baseName;

  ensureNameLength(effectiveName, options);

  return effectiveName;
}

export function buildStackName(settings: BootstrapSettings, baseName: string): string {
  return buildResourceName(settings, baseName, {
    label: `CloudFormation stack name for ${baseName}`,
    maxLength: 128,
  });
}

function readString(app: cdk.App, key: string, fallback: string): string {
  const value = app.node.tryGetContext(key);
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNumber(app: cdk.App, key: string, fallback: number): number {
  const value = app.node.tryGetContext(key);
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readOptionalString(app: cdk.App, key: string): string | undefined {
  const value = app.node.tryGetContext(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function validateBootstrapSettings(settings: BootstrapSettings): void {
  if (!settings.resourcePrefix) {
    return;
  }

  if (!RESOURCE_PREFIX_PATTERN.test(settings.resourcePrefix)) {
    throw new Error(
      'resourcePrefix must contain only lowercase letters, numbers, and hyphens, and it cannot start or end with a hyphen.',
    );
  }
}

function ensureNameLength(name: string, options: ResourceNameOptions): void {
  if (!options.maxLength || name.length <= options.maxLength) {
    return;
  }

  throw new Error(
    `${options.label ?? 'Resource name'} "${name}" exceeds max length ${options.maxLength}. Shorten projectName or resourcePrefix.`,
  );
}
