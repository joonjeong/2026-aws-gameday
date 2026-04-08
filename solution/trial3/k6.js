/**
 * Unicorn Rental Complex — k6 테스트 스크립트
 *
 * 소스 근거:
 *   - GET  /actuator/health              (헬스체크, 인증 불필요)
 *   - GET  /api/rentals                  (자산 목록, 인증 불필요)
 *   - POST /api/sessions                 (세션 생성, body: {userName})
 *   - GET  /api/sessions/current         (세션 확인, X-Session-Id 헤더)
 *   - GET  /api/orders                   (주문 목록, X-Session-Id 헤더)
 *   - POST /api/orders/reserve           (예약, body: {rentalId})  ← WRITE_ENABLED=true 시만 실행
 *   - POST /api/orders/return            (반납, body: {rentalId})  ← WRITE_ENABLED=true 시만 실행
 *   - DELETE /api/sessions/current       (세션 삭제, X-Session-Id 헤더)
 *
 * 실행 방법:
 *   # 스모크 (기본, 안전)
 *   k6 run k6.js
 *
 *   # 로드 테스트
 *   k6 run -e SCENARIO=load k6.js
 *
 *   # 쓰기 경로 포함 (실제 DB 변경 발생)
 *   k6 run -e WRITE_ENABLED=true k6.js
 *
 *   # ALB 직접 지정
 *   k6 run -e BASE_URL=http://unicorn-rental-complex-alb-593203897.ap-northeast-2.elb.amazonaws.com k6.js
 *
 * 환경변수:
 *   BASE_URL        타깃 URL (기본: ALB DNS)
 *   SCENARIO        smoke(기본) | load
 *   WRITE_ENABLED   true 시 reserve/return 실행 (기본: false)
 *   VUS             로드 테스트 최대 VU 수 (기본: 20)
 *   DURATION        로드 테스트 steady-state 시간 (기본: 3m)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── 설정 ────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL ||
  'http://unicorn-rental-complex-alb-893851409.ap-northeast-2.elb.amazonaws.com';

const WRITE_ENABLED = __ENV.WRITE_ENABLED === 'true';
const SCENARIO = __ENV.SCENARIO || 'smoke';
const MAX_VUS = parseInt(__ENV.VUS || '20');
const STEADY_DURATION = __ENV.DURATION || '3m';

// data.sql 기준 초기 자산 ID
const RENTAL_IDS = ['rainbow-1', 'pegasus-2', 'aurora-3', 'mist-4'];

// ─── 시나리오 ─────────────────────────────────────────────────────────────────

const smokeOptions = {
  vus: 2,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(99)<3000'],
    checks: ['rate>0.99'],
  },
};

const loadOptions = {
  stages: [
    { duration: '1m', target: Math.floor(MAX_VUS * 0.5) }, // ramp-up
    { duration: STEADY_DURATION, target: MAX_VUS },         // steady-state
    { duration: '1m', target: 0 },                          // ramp-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    checks: ['rate>0.95'],
    // 쓰기 경로 활성화 시 reserve 성공률 별도 추적
    'reserve_errors': ['rate<0.1'],
  },
  // 실제 트래픽이 있는 환경 — 기본 부하는 보수적으로 유지
  // MAX_VUS 기본값 20은 의도적으로 낮게 설정
};

export const options = SCENARIO === 'load' ? loadOptions : smokeOptions;

// ─── 커스텀 메트릭 ────────────────────────────────────────────────────────────

const reserveErrors = new Rate('reserve_errors');
const sessionLatency = new Trend('session_create_duration');

// ─── 공통 헤더 ────────────────────────────────────────────────────────────────

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function authHeaders(sessionId) {
  return { 'Content-Type': 'application/json', 'X-Session-Id': sessionId };
}

// ─── 메인 시나리오 ────────────────────────────────────────────────────────────

export default function () {
  // 1. 헬스체크 (ALB health check 경로와 동일)
  const health = http.get(`${BASE_URL}/actuator/health`);
  check(health, {
    'health: status 200': (r) => r.status === 200,
    'health: UP': (r) => r.json('status') === 'UP',
  });

  sleep(0.5);

  // 2. 자산 목록 조회 (인증 불필요, 읽기 전용)
  const rentals = http.get(`${BASE_URL}/api/rentals`);
  check(rentals, {
    'rentals: status 200': (r) => r.status === 200,
    'rentals: array': (r) => Array.isArray(r.json()),
  });

  sleep(0.5);

  // 3. 세션 생성
  const sessionStart = Date.now();
  const sessionRes = http.post(
    `${BASE_URL}/api/sessions`,
    JSON.stringify({ userName: `k6-user-${__VU}-${__ITER}` }),
    { headers: JSON_HEADERS },
  );
  sessionLatency.add(Date.now() - sessionStart);

  const sessionOk = check(sessionRes, {
    'session: status 201': (r) => r.status === 201,
    'session: has sessionId': (r) => !!r.json('sessionId'),
  });

  if (!sessionOk) {
    sleep(1);
    return;
  }

  const sessionId = sessionRes.json('sessionId');

  sleep(0.3);

  // 4. 현재 세션 확인
  const currentSession = http.get(
    `${BASE_URL}/api/sessions/current`,
    { headers: authHeaders(sessionId) },
  );
  check(currentSession, {
    'current session: status 200': (r) => r.status === 200,
    'current session: sessionId match': (r) => r.json('sessionId') === sessionId,
  });

  sleep(0.3);

  // 5. 주문 목록 조회
  const orders = http.get(
    `${BASE_URL}/api/orders`,
    { headers: authHeaders(sessionId) },
  );
  check(orders, {
    'orders: status 200': (r) => r.status === 200,
    'orders: array': (r) => Array.isArray(r.json()),
  });

  // 6. 쓰기 경로 (WRITE_ENABLED=true 시만 실행)
  if (WRITE_ENABLED) {
    const rentalId = RENTAL_IDS[__VU % RENTAL_IDS.length];

    sleep(0.3);

    const reserve = http.post(
      `${BASE_URL}/api/orders/reserve`,
      JSON.stringify({ rentalId }),
      { headers: authHeaders(sessionId) },
    );
    // 409 Conflict(이미 예약됨)는 정상 경쟁 상황 — 오류로 집계하지 않음
    const reserveOk = reserve.status === 201 || reserve.status === 200 || reserve.status === 409;
    reserveErrors.add(!reserveOk);
    check(reserve, {
      'reserve: 2xx or 409': () => reserveOk,
    });

    // 예약 성공 시에만 반납
    if (reserve.status === 201 || reserve.status === 200) {
      sleep(0.5);
      const ret = http.post(
        `${BASE_URL}/api/orders/return`,
        JSON.stringify({ rentalId }),
        { headers: authHeaders(sessionId) },
      );
      check(ret, {
        'return: 2xx': (r) => r.status >= 200 && r.status < 300,
      });
    }
  }

  sleep(0.5);

  // 7. 세션 삭제 (정리)
  const del = http.del(
    `${BASE_URL}/api/sessions/current`,
    null,
    { headers: authHeaders(sessionId) },
  );
  check(del, {
    'delete session: status 200': (r) => r.status === 200,
  });

  sleep(1);
}

// ─── 중단 조건 ────────────────────────────────────────────────────────────────
// k6 thresholds abortOnFail 설정 (로드 테스트 시 자동 중단)
// 아래 조건 중 하나라도 충족되면 테스트 중단:
//   - 5xx 비율 > 10%
//   - p99 응답 시간 > 10초
// 이 값은 loadOptions.thresholds에 abortOnFail로 추가 가능:
//
//   http_req_failed: [{ threshold: 'rate<0.10', abortOnFail: true }],
//   http_req_duration: [{ threshold: 'p(99)<10000', abortOnFail: true }],
