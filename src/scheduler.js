import { runDailyAutomation } from './contentEngine.js';
import { msUntilNext, timeZone } from './dates.js';

// Lightweight in-process daily scheduler. No external cron dependency:
// it computes the delay until the next HH:MM wall-clock time in the content
// time zone, fires once, then reschedules for the following day.

function parseTime(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return fallback;
  return { hour, minute };
}

function readConfig() {
  const { hour, minute } = parseTime(process.env.AUTOMATION_TIME, { hour: 8, minute: 0 });
  return {
    enabled: String(process.env.AUTOMATION_ENABLED ?? 'true').toLowerCase() === 'true',
    hour,
    minute,
    queueTarget: Math.max(1, Math.min(Number(process.env.AUTOMATION_QUEUE_TARGET) || 7, 30)),
    autoRender: String(process.env.AUTOMATION_AUTO_RENDER ?? 'true').toLowerCase() === 'true',
    runOnStart: String(process.env.AUTOMATION_RUN_ON_START ?? 'false').toLowerCase() === 'true'
  };
}

const state = {
  config: readConfig(),
  timer: null,
  running: false,
  nextRunAt: null,
  lastRunAt: null,
  lastResult: null
};

export function getSchedulerState() {
  const { enabled, hour, minute, queueTarget, autoRender, runOnStart } = state.config;
  return {
    enabled,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    time_zone: timeZone(),
    queue_target: queueTarget,
    auto_render: autoRender,
    run_on_start: runOnStart,
    running: state.running,
    next_run_at: state.nextRunAt,
    last_run_at: state.lastRunAt,
    last_result: state.lastResult
  };
}

export async function runAutomationNow() {
  if (state.running) {
    return { skipped: true, reason: 'Automation already running' };
  }

  state.running = true;
  try {
    const result = await runDailyAutomation({
      queueTarget: state.config.queueTarget,
      autoRender: state.config.autoRender
    });
    state.lastRunAt = new Date().toISOString();
    state.lastResult = result;
    return result;
  } catch (error) {
    const failure = { error: error.message, code: error.code, at: new Date().toISOString() };
    state.lastRunAt = failure.at;
    state.lastResult = failure;
    return failure;
  } finally {
    state.running = false;
  }
}

function scheduleNext() {
  const delay = msUntilNext(state.config.hour, state.config.minute);
  state.nextRunAt = new Date(Date.now() + delay).toISOString();

  clearTimeout(state.timer);
  state.timer = setTimeout(async () => {
    console.log('[scheduler] daily automation firing');
    const result = await runAutomationNow();
    console.log('[scheduler] daily automation done', JSON.stringify(result));
    scheduleNext();
  }, delay);

  // Do not keep the event loop alive solely for the scheduler.
  if (typeof state.timer.unref === 'function') state.timer.unref();
}

export function startScheduler() {
  state.config = readConfig();

  if (!state.config.enabled) {
    console.log('[scheduler] automation disabled (AUTOMATION_ENABLED=false)');
    return;
  }

  scheduleNext();
  const time = `${String(state.config.hour).padStart(2, '0')}:${String(state.config.minute).padStart(2, '0')}`;
  console.log(`[scheduler] automation enabled, next run at ${state.nextRunAt} (${time} ${timeZone()})`);

  if (state.config.runOnStart) {
    setTimeout(() => {
      console.log('[scheduler] run-on-start firing');
      runAutomationNow().then((result) => console.log('[scheduler] run-on-start done', JSON.stringify(result)));
    }, 3000);
  }
}
