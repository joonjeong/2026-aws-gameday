import * as cdk from 'aws-cdk-lib';
import { EnigmaSettings } from './types';

const RESOURCE_PREFIX_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

interface ResourceNameOptions {
  label?: string;
  maxLength?: number;
}

export function loadEnigmaSettings(app: cdk.App): EnigmaSettings {
  const settings = {
    resourcePrefix: readOptionalString(app, 'resourcePrefix'),
    projectName: readString(app, 'projectName', 'enigma'),
    targetBaseUrl: readString(app, 'targetBaseUrl', 'http://example.com'),
    targetTimeoutMs: readNumber(app, 'targetTimeoutMs', 3000),
    baselineEnabled: readBoolean(app, 'baselineEnabled', true),
    anomalyEnabled: readBoolean(app, 'anomalyEnabled', true),
    baselineScheduleExpression: readString(app, 'baselineScheduleExpression', 'rate(5 minutes)'),
    anomalyScheduleExpression: readString(app, 'anomalyScheduleExpression', 'cron(0 */6 * * ? *)'),
    scheduleTimezone: readString(app, 'scheduleTimezone', 'Asia/Seoul'),
    anomalyFlexibleWindowMinutes: readNumber(app, 'anomalyFlexibleWindowMinutes', 60),
    baselineCpu: readNumber(app, 'baselineCpu', 256),
    baselineMemoryMiB: readNumber(app, 'baselineMemoryMiB', 512),
    anomalyCpu: readNumber(app, 'anomalyCpu', 1024),
    anomalyMemoryMiB: readNumber(app, 'anomalyMemoryMiB', 2048),
  };

  validateEnigmaSettings(settings);

  return settings;
}

export function applyEnigmaTags(scope: cdk.Stack, settings: EnigmaSettings): void {
  cdk.Tags.of(scope).add('Project', settings.projectName);
  cdk.Tags.of(scope).add('ManagedBy', 'cloudformation');
  cdk.Tags.of(scope).add('Purpose', 'gameday-traffic-injection');

  if (settings.resourcePrefix) {
    cdk.Tags.of(scope).add('ResourcePrefix', settings.resourcePrefix);
  }
}

export function buildResourceName(
  settings: EnigmaSettings,
  baseName: string,
  options: ResourceNameOptions = {},
): string {
  const effectiveName = settings.resourcePrefix
    ? `${settings.resourcePrefix}-${baseName}`
    : baseName;

  ensureNameLength(effectiveName, options);

  return effectiveName;
}

export function buildStackName(settings: EnigmaSettings, baseName: string): string {
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

function readBoolean(app: cdk.App, key: string, fallback: boolean): boolean {
  const value = app.node.tryGetContext(key);
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }

    if (value.toLowerCase() === 'false') {
      return false;
    }
  }

  return fallback;
}

function readOptionalString(app: cdk.App, key: string): string | undefined {
  const value = app.node.tryGetContext(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function validateEnigmaSettings(settings: EnigmaSettings): void {
  if (settings.resourcePrefix && !RESOURCE_PREFIX_PATTERN.test(settings.resourcePrefix)) {
    throw new Error(
      'resourcePrefix must contain only lowercase letters, numbers, and hyphens, and it cannot start or end with a hyphen.',
    );
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(settings.targetBaseUrl);
  } catch {
    throw new Error(`targetBaseUrl must be a valid absolute URL. Received "${settings.targetBaseUrl}".`);
  }

  if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
    throw new Error(`targetBaseUrl must use http or https. Received "${settings.targetBaseUrl}".`);
  }

  if (settings.targetTimeoutMs <= 0) {
    throw new Error('targetTimeoutMs must be greater than zero.');
  }

  if (settings.anomalyFlexibleWindowMinutes < 0) {
    throw new Error('anomalyFlexibleWindowMinutes cannot be negative.');
  }

  for (const [key, value] of Object.entries({
    baselineCpu: settings.baselineCpu,
    baselineMemoryMiB: settings.baselineMemoryMiB,
    anomalyCpu: settings.anomalyCpu,
    anomalyMemoryMiB: settings.anomalyMemoryMiB,
  })) {
    if (value <= 0) {
      throw new Error(`${key} must be greater than zero.`);
    }
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
