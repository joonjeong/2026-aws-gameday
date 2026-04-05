import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 2,
  duration: '5m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = 'http://unicorn-rental-alb-97259582.ap-northeast-2.elb.amazonaws.com';

export default function () {
  const res = http.get(BASE_URL);
  check(res, {
    'status is 2xx or 3xx': (r) => r.status >= 200 && r.status < 400,
  });
}
