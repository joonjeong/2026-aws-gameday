import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

const BASE_URL = __ENV.BASE_URL || 'http://unicorn-rental-alb-97259582.ap-northeast-2.elb.amazonaws.com';

// 실행 시나리오 — 환경변수 SCENARIO로 선택 (default: smoke)
const scenarios = {
  // 기본 동작 확인
  smoke: {
    executor: 'constant-vus',
    vus: 2,
    duration: '30s',
  },
  // 부하 테스트
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50 },
      { duration: '3m', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },
  // 스파이크 테스트 (트래픽 폭주 시뮬레이션)
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },
      { duration: '30s', target: 200 },  // 급격한 증가
      { duration: '1m',  target: 200 },
      { duration: '30s', target: 10 },
      { duration: '30s', target: 0 },
    ],
  },
};

const selectedScenario = __ENV.SCENARIO || 'smoke';

export const options = {
  scenarios: {
    test: scenarios[selectedScenario],
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95%ile 응답 2초 이내
    errors: ['rate<0.05'],              // 에러율 5% 미만
  },
};

// 테스트할 엔드포인트 목록 — 실제 API 경로 확인 후 수정
const endpoints = [
  { method: 'GET',  path: '/',               name: 'health' },
  { method: 'GET',  path: '/api/rentals',    name: 'list rentals' },
  { method: 'GET',  path: '/api/unicorns',   name: 'list unicorns' },
];

export default function () {
  const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
  const url = `${BASE_URL}${ep.path}`;

  const res = ep.method === 'GET'
    ? http.get(url, { tags: { name: ep.name } })
    : http.post(url, JSON.stringify({}), {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: ep.name },
      });

  const ok = check(res, {
    'status 2xx': (r) => r.status >= 200 && r.status < 300,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(!ok);
  sleep(1);
}
