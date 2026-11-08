export async function loadFeeds({ url, anonKey, translate }) {
  const endpoint = new URL('/rest/v1/feeds', url);
  endpoint.search = new URLSearchParams({ select: 'data,updated_at', order: 'id' });
  const response = await fetch(endpoint, { headers: { apikey: anonKey } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);

  const rows = await response.json();
  if (!rows?.length) throw new Error(translate('status.noFeeds'));

  const latest = rows.map(row => row.updated_at).filter(Boolean).sort().at(-1);
  return {
    generatedAt: latest,
    schedules: rows.map(row => row.data),
  };
}
