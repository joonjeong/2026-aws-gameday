import http from 'k6/http';
import { check, sleep } from 'k6';
import { baseUrl, customerId, defaultRequestParams, pickRandom, rentalIds } from './lib/config.js';

export const options = {
  scenarios: {
    baseline: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 2 },
        { duration: '3m', target: 4 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    checks: ['rate>0.95'],
    http_req_duration: ['p(95)<1500'],
  },
};

function visitReadEndpoints() {
  const endpoints = [
    '/',
    '/actuator/health',
    '/api/rentals',
    '/api/orders',
  ];

  for (const path of endpoints) {
    const response = http.get(`${baseUrl}${path}`, defaultRequestParams({ flow: 'read', path }));
    check(response, {
      [`${path} responds with 200`]: (res) => res.status === 200,
    });
  }
}

function createAndCancelOrder() {
  const rentalId = pickRandom(rentalIds);
  const customer = customerId('steady');
  const createResponse = http.get(
    `${baseUrl}/api/orders/create?rentalId=${encodeURIComponent(rentalId)}&customer=${encodeURIComponent(customer)}&days=2`,
    defaultRequestParams({ flow: 'create-order' }),
  );

  const createSucceeded = check(createResponse, {
    'create order returns 200 or 409': (res) => [200, 409].includes(res.status),
  });

  if (!createSucceeded || createResponse.status !== 200) {
    return;
  }

  const payload = createResponse.json();
  const orderId = extractOrderId(payload);
  if (!orderId) {
    return;
  }

  const cancelResponse = http.get(
    `${baseUrl}/api/orders/cancel?id=${encodeURIComponent(orderId)}`,
    defaultRequestParams({ flow: 'cancel-order' }),
  );
  check(cancelResponse, {
    'cancel order returns 200': (res) => res.status === 200,
  });
}

function exerciseInventoryState() {
  const rentalId = pickRandom(rentalIds.slice(0, 2));
  const customer = customerId('reserve');
  const reserveResponse = http.get(
    `${baseUrl}/api/rentals/reserve?id=${encodeURIComponent(rentalId)}&customer=${encodeURIComponent(customer)}`,
    defaultRequestParams({ flow: 'reserve' }),
  );

  const reserved = reserveResponse.status === 200;
  check(reserveResponse, {
    'reserve returns 200 or 409': (res) => [200, 409].includes(res.status),
  });

  if (!reserved) {
    return;
  }

  const returnResponse = http.get(
    `${baseUrl}/api/rentals/return?id=${encodeURIComponent(rentalId)}`,
    defaultRequestParams({ flow: 'return' }),
  );
  check(returnResponse, {
    'return returns 200': (res) => res.status === 200,
  });
}

function extractOrderId(payload) {
  if (!payload || !payload.order) {
    return undefined;
  }

  return payload.order.orderId;
}

export default function () {
  visitReadEndpoints();
  createAndCancelOrder();
  exerciseInventoryState();
  sleep(1);
}
