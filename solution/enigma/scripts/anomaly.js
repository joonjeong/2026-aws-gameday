import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { check, sleep } from 'k6';
import { baseUrl, customerId, defaultRequestParams, pickRandom, rentalIds } from './lib/config.js';

const anomalyResponses = new Counter('anomaly_expected_responses');
const anomalyHttpResponses = new Counter('anomaly_http_responses');

export const options = {
  scenarios: {
    invalidRequests: {
      executor: 'constant-arrival-rate',
      rate: 24,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 24,
      maxVUs: 72,
      exec: 'runInvalidRequests',
    },
    contentionSpike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '45s', target: 24 },
        { duration: '2m30s', target: 64 },
        { duration: '45s', target: 0 },
      ],
      gracefulRampDown: '15s',
      exec: 'runContentionSpike',
    },
  },
  thresholds: {
    anomaly_expected_responses: ['count>20'],
    anomaly_http_responses: ['count>50'],
  },
};

const invalidGenerators = [
  () => http.post(
    `${baseUrl}/api/orders`,
    '',
    defaultRequestParams({ flow: 'bad-method', target: 'orders' }),
  ),
  () => http.get(
    `${baseUrl}/api/rentals/reserve?id=${encodeURIComponent(pickRandom(rentalIds))}`,
    defaultRequestParams({ flow: 'missing-customer' }),
  ),
  () => http.get(
    `${baseUrl}/api/orders/create?rentalId=missing-rental&customer=${encodeURIComponent(customerId('chaos'))}`,
    defaultRequestParams({ flow: 'missing-rental' }),
  ),
  () => http.get(
    `${baseUrl}/api/orders/cancel?id=order-does-not-exist`,
    defaultRequestParams({ flow: 'cancel-missing-order' }),
  ),
];

export function runInvalidRequests() {
  const response = pickRandom(invalidGenerators)();
  recordHttpResponse(response);
  const expected = [400, 405, 409].includes(response.status);
  anomalyResponses.add(expected ? 1 : 0);
  check(response, {
    'invalid request stays within expected error band': (res) => [400, 405, 409].includes(res.status),
  });
}

export function runContentionSpike() {
  const rentalId = pickRandom(rentalIds.slice(0, 2));
  const customer = customerId('burst');
  const createResponse = http.get(
    `${baseUrl}/api/orders/create?rentalId=${encodeURIComponent(rentalId)}&customer=${encodeURIComponent(customer)}&days=1`,
    defaultRequestParams({ flow: 'contention-create' }),
  );

  recordHttpResponse(createResponse);
  const acceptable = [200, 409].includes(createResponse.status);
  anomalyResponses.add(acceptable ? 1 : 0);
  check(createResponse, {
    'contention create returns 200 or 409': (res) => [200, 409].includes(res.status),
  });

  if (createResponse.status === 200) {
    const payload = createResponse.json();
    const orderId = extractOrderId(payload);
    if (orderId) {
      const cancelResponse = http.get(
        `${baseUrl}/api/orders/cancel?id=${encodeURIComponent(orderId)}`,
        defaultRequestParams({ flow: 'contention-cancel' }),
      );
      recordHttpResponse(cancelResponse);
      anomalyResponses.add(cancelResponse.status === 200 ? 1 : 0);
      check(cancelResponse, {
        'contention cancel returns 200': (res) => res.status === 200,
      });
    }
  }

  sleep(0.05);
}

function extractOrderId(payload) {
  if (!payload || !payload.order) {
    return undefined;
  }

  return payload.order.orderId;
}

function recordHttpResponse(response) {
  anomalyHttpResponses.add(response && response.status > 0 ? 1 : 0);
}
