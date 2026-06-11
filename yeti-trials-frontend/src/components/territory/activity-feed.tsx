import type { FeedItem } from '~/lib/sui/events';

/** Recent on-chain activity. Read-only; reflects confirmed events. */
export function ActivityFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <aside aria-label="Activity feed" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-tight text-frost-ice">Activity</h3>
      {feed.length === 0 ? (
        <p className="text-xs text-frost-mist">No recent on-chain events.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-frost-line">
          {feed.map((item) => (
            <li key={item.id} className="py-1.5 text-xs text-frost-mist">
              <span className="font-mono text-frost-ice">{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
