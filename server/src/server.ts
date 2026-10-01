import { buildApp } from './app.js';
import { loadConfig } from './platform/config.js';
import { ReviewService } from './modules/reviews/service.js';

/** Production/dev entrypoint. `pnpm dev` runs `tsx watch src/server.ts`. */
async function main() {
  const config = loadConfig();
  const app = await buildApp({ config });

  // Reap runs left 'running' by a previous (now-dead) process — otherwise they
  // show as perpetually "running" in the UI and can't be cancelled (no runner).
  // Here, not in buildApp: tests build the app too, and config loads server/.env,
  // so a reap in buildApp marked the dev DB's in-flight reviews failed on every
  // `pnpm test`. AWAITED before listen, so no run of this process can be reaped.
  // NOTE: assumes a SINGLE API instance per DB.
  try {
    const reaped = await new ReviewService(app.container).reapStaleRuns();
    if (reaped > 0) app.log.info({ reaped }, 'reaped stale running agent_runs on boot');
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'stale-run reaping failed (non-fatal)');
  }

  // Graceful shutdown: on SIGTERM/SIGINT close the server, which runs the
  // onClose hooks (drains in-flight requests/SSE, closes the postgres pool).
  // Guarded so a second signal during shutdown doesn't double-close.
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, async () => {
      if (closing) return;
      closing = true;
      app.log.info(`${signal} received — shutting down`);
      try {
        await app.close();
        process.exit(0);
      } catch (err) {
        app.log.error(err, 'error during shutdown');
        process.exit(1);
      }
    });
  }

  try {
    await app.listen({ port: config.apiPort, host: config.apiHost });
    app.log.info(`DevDigest API listening on http://${config.apiHost}:${config.apiPort}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
