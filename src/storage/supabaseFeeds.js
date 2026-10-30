import { createHash } from 'node:crypto';

const toISODate = value => value
  ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  : null;

function toDatabaseRow(feed, updatedAt) {
  const starts = feed.cal.map(calendar => calendar[2]).filter(Boolean).sort();
  const ends = feed.cal.map(calendar => calendar[3]).filter(Boolean).sort();
  const serialized = JSON.stringify(feed);
  return {
    id: feed.id,
    label: feed.label,
    valid_from: toISODate(starts[0]),
    valid_to: toISODate(ends.at(-1)),
    content_hash: createHash('sha256').update(serialized).digest('hex'),
    updated_at: updatedAt.toISOString(),
    data: feed,
  };
}

export async function upsertFeeds(feeds, { url, serviceKey, updatedAt = new Date() }) {
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required to update schedules.');
  }
  if (!feeds.length) throw new Error('There are no feeds to write to Supabase.');

  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/feeds?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(feeds.map(feed => toDatabaseRow(feed, updatedAt))),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(`Failed to write schedules to Supabase: HTTP ${response.status} ${await response.text()}`);
  }
}
