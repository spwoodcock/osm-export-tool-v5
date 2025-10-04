export async function queryPostpass(sql: string) {
  const endpoint = 'https://postpass.geofabrik.de/api/0.2/interpreter';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: sql })
  });

  if (!response.ok) {
    throw new Error(`Postpass query failed: ${response.statusText}`);
  }

  return response.json();
}
