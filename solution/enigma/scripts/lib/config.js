import { SharedArray } from 'k6/data';

function normalizeBaseUrl(url) {
  const trimmed = (url || '').trim();
  return trimmed.replace(/\/+$/, '');
}

function parseInteger(name, fallback) {
  const raw = __ENV[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const baseUrl = normalizeBaseUrl(__ENV.TARGET_BASE_URL || 'http://example.com');
export const timeoutMs = parseInteger('TARGET_TIMEOUT_MS', 3000);
export const rentalIds = new SharedArray('rental-ids', () => {
  const values = (__ENV.RENTAL_IDS || 'demo-1,demo-2,demo-3')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? values : ['demo-1', 'demo-2', 'demo-3'];
});

export function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function customerId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultRequestParams(tags = {}) {
  return {
    timeout: `${timeoutMs}ms`,
    tags,
  };
}

