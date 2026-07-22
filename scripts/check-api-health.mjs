import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_CONCURRENCY = 4;
const USER_AGENT = 'API-Atlas-Health-Check/1.0 (+https://github.com/vip7733661/ASIRI-2026)';

const PROBE_OVERRIDES = {
  'sec-edgar': {
    url: 'https://data.sec.gov/submissions/CIK0000320193.json',
    kind: 'data-endpoint',
    note: 'اختبار Endpoint بيانات رسمي لعينة Apple لدى SEC.'
  }
};

export function classifyStatus(httpStatus, errorCode = '') {
  if (errorCode === 'timeout') return 'degraded';
  if (errorCode) return 'unavailable';
  if (httpStatus >= 200 && httpStatus < 400) return 'operational';
  if ([401, 403, 405, 429].includes(httpStatus)) return 'restricted';
  if (httpStatus >= 500) return 'degraded';
  return 'unavailable';
}

export function summarize(results) {
  const counts = {
    operational: 0,
    restricted: 0,
    degraded: 0,
    unavailable: 0
  };
  for (const result of results) counts[result.status] += 1;
  const total = results.length || 1;
  const reachable = counts.operational + counts.restricted;
  return {
    total: results.length,
    operational: counts.operational,
    restricted: counts.restricted,
    degraded: counts.degraded,
    unavailable: counts.unavailable,
    operationalRate: Number(((counts.operational / total) * 100).toFixed(1)),
    reachabilityRate: Number(((reachable / total) * 100).toFixed(1))
  };
}

export function parseArgs(argv) {
  const args = {
    catalog: 'api-intelligence/catalog.js',
    output: 'api-intelligence/live-status.json',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--catalog') args.catalog = argv[++index];
    else if (value === '--output') args.output = argv[++index];
    else if (value === '--timeout-ms') args.timeoutMs = Number(argv[++index]);
    else if (value === '--concurrency') args.concurrency = Number(argv[++index]);
  }
  return args;
}

export async function loadCatalog(catalogPath) {
  const source = await fs.readFile(catalogPath, 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: catalogPath });
  const catalog = context.window.API_ATLAS_CATALOG;
  if (!catalog?.items?.length) throw new Error('Catalog is empty or invalid.');
  return catalog;
}

async function probe(item, timeoutMs) {
  const override = PROBE_OVERRIDES[item.id];
  const targetUrl = override?.url || item.docs;
  const probeKind = override?.kind || 'documentation';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json,text/html;q=0.9,*/*;q=0.8'
      }
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const corsHeader = response.headers.get('access-control-allow-origin');
    if (response.body) await response.body.cancel().catch(() => {});
    return {
      id: item.id,
      name: item.name,
      status: classifyStatus(response.status),
      httpStatus: response.status,
      latencyMs,
      checkedAt: new Date().toISOString(),
      probeKind,
      targetUrl,
      finalUrl: response.url || targetUrl,
      targetHost: new URL(targetUrl).host,
      corsObserved: corsHeader || null,
      note: override?.note || 'اختبار توفر صفحة التوثيق الرسمية؛ لا يثبت دقة بيانات السوق.'
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const timeoutError = error?.name === 'AbortError' || controller.signal.aborted;
    return {
      id: item.id,
      name: item.name,
      status: classifyStatus(0, timeoutError ? 'timeout' : 'network'),
      httpStatus: null,
      latencyMs,
      checkedAt: new Date().toISOString(),
      probeKind,
      targetUrl,
      finalUrl: null,
      targetHost: new URL(targetUrl).host,
      corsObserved: null,
      error: timeoutError ? 'timeout' : String(error?.message || error),
      note: override?.note || 'تعذر الوصول أثناء الفحص؛ قد يكون العطل مؤقتًا أو حظرًا لبيئة الفحص.'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runHealthCheck(options) {
  const catalog = await loadCatalog(options.catalog);
  const results = await mapWithConcurrency(
    catalog.items,
    options.concurrency,
    (item) => probe(item, options.timeoutMs)
  );
  const generatedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    generatedAt,
    sourceSnapshot: catalog.meta.sourceSnapshot,
    methodology: {
      scope: 'availability-and-latency',
      schedule: 'every-6-hours',
      disclaimer: 'الحالة تقيس قابلية الوصول وزمن الاستجابة فقط، ولا تثبت دقة البيانات أو حداثتها أو الحقوق التجارية.'
    },
    summary: summarize(results),
    services: Object.fromEntries(results.map((result) => [result.id, result]))
  };
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  runHealthCheck(options)
    .then((payload) => {
      console.log(`Checked ${payload.summary.total} services.`);
      console.log(`Reachability: ${payload.summary.reachabilityRate}%`);
      console.log(`Output: ${options.output}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
