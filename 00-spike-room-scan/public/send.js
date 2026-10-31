// Optional: open the page with ?send=<url> to also post each scan to the laptop server
// (e.g. ?send=http://localhost:8080 with `adb reverse tcp:8080 tcp:8080`). Without it, scans stay in the browser.
export const SEND = new URLSearchParams(location.search).get('send');

export async function sendScan(scan) {
  if (!SEND) throw new Error('no ?send= server given');
  const res = await fetch(new URL('/api/scan', SEND), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(scan),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
