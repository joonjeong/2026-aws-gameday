import * as cdk from 'aws-cdk-lib';
import { BootstrapSettings } from './types';

export function loadBootstrapSettings(app: cdk.App): BootstrapSettings {
  return {
    projectName: readString(app, 'projectName', 'unicorn-rental'),
    operatorUserName: readString(app, 'operatorUserName', 'unicorn-rental-operator'),
    instanceType: readString(app, 'instanceType', 't3.small'),
    desiredCapacity: readNumber(app, 'desiredCapacity', 2),
    minCapacity: readNumber(app, 'minCapacity', 2),
    maxCapacity: readNumber(app, 'maxCapacity', 4),
    healthCheckPath: readString(app, 'healthCheckPath', '/actuator/health'),
  };
}

export function applyBootstrapTags(scope: cdk.Stack, projectName: string): void {
  cdk.Tags.of(scope).add('Project', projectName);
  cdk.Tags.of(scope).add('ManagedBy', 'cloudformation');
  cdk.Tags.of(scope).add('Purpose', 'gameday-bootstrap');
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

