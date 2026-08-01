import type { LoggerService } from '@backstage/backend-plugin-api';
import type { queueAsPromised } from 'fastq';
import fastq from 'fastq';
import type {
  AdoptionAnalyticsDatabase,
  PersistedEvent,
} from './AdoptionAnalyticsDatabase';

const MAX_BUFFER_SIZE = 500;

type FlushTask = {
  reason: 'scheduled' | 'shutdown' | 'size';
};

/**
 * In-memory buffer for ingested analytics events that flushes to the
 * database in bulk. `push()` is non-blocking so `POST /events` returns
 * immediately; a fastq worker with concurrency 1 serialises actual DB
 * inserts so a slow flush doesn't overlap with the next one.
 *
 * A scheduled task should call `flush('scheduled')` periodically to drain
 * quiet periods, while `push()` triggers an immediate flush when the
 * buffer reaches `MAX_BUFFER_SIZE`.
 */
export class EventsQueue {
  private buffer: PersistedEvent[] = [];
  private readonly worker: queueAsPromised<FlushTask, void>;

  constructor(
    private readonly db: AdoptionAnalyticsDatabase,
    private readonly logger: LoggerService,
  ) {
    // Concurrency 1 keeps inserts strictly serialised — safer for both
    // SQLite (no writer contention) and Postgres (predictable throughput).
    this.worker = fastq.promise(this, this.drainBuffer, 1);
  }

  push(event: PersistedEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      // Fire-and-forget: caller doesn't need to wait on the DB.
      void this.flush('size');
    }
  }

  /**
   * Forces a flush of the current buffer. Safe to call from any context;
   * concurrent callers are serialised through the fastq worker.
   */
  async flush(reason: FlushTask['reason'] = 'scheduled'): Promise<void> {
    await this.worker.push({ reason });
  }

  private async drainBuffer(task: FlushTask): Promise<void> {
    if (this.buffer.length === 0) return;

    // Swap the buffer atomically so events posted during this flush
    // land in the *next* batch instead of getting mid-drain surprises.
    const batch = this.buffer;
    this.buffer = [];

    try {
      await this.db.recordEvents(batch);
      this.logger.debug(
        `adoption-analytics-backend: flushed ${batch.length} events (${task.reason})`,
      );
    } catch (err) {
      // Requeue the batch so a transient DB blip doesn't lose events.
      // The bounded MAX_BUFFER_SIZE below caps memory in prolonged outages.
      this.buffer = [...batch, ...this.buffer].slice(-MAX_BUFFER_SIZE * 2);
      this.logger.error(
        `adoption-analytics-backend: flush failed (${
          task.reason
        }), re-buffered ${batch.length} events: ${(err as Error).message}`,
      );
    }
  }

  /** Test-only view of the current buffer size. */
  size(): number {
    return this.buffer.length;
  }
}
