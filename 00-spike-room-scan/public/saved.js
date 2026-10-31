// The scans this browser kept: pick one, see it from above, download or send it.
import { drawPlan, download } from './plan.js';
import { listScans, clearScans } from './store.js';
import { SEND, sendScan } from './send.js';

const pick = document.getElementById('pick');
const svg = document.getElementById('plan');
const info = document.getElementById('info');
const downloadBtn = document.getElementById('download');
const sendBtn = document.getElementById('send');
const clearBtn = document.getElementById('clear');

let scans = [];
const current = () => scans.find((s) => s.name === pick.value);

function show() {
  const s = current();
  if (!s) {
    svg.replaceChildren();
    info.textContent = 'No scans yet. Enter the room, then exit to see what was saved.';
    return;
  }
  info.textContent = JSON.stringify(drawPlan(svg, s.scan), null, 2);
}

export function refreshSaved() {
  scans = listScans();
  const keep = pick.value;
  pick.replaceChildren(...scans.map((s) => new Option(s.name, s.name)));
  if (scans.some((s) => s.name === keep)) pick.value = keep;
  for (const b of [downloadBtn, sendBtn, clearBtn]) b.disabled = !scans.length;
  sendBtn.hidden = !SEND;
  show();
}

pick.addEventListener('change', show);
downloadBtn.addEventListener('click', () => { const s = current(); if (s) download(s.scan, s.name); });
sendBtn.addEventListener('click', async () => {
  const s = current();
  if (!s) return;
  try {
    info.textContent = `sent: ${(await sendScan(s.scan)).file}`;
  } catch (e) {
    info.textContent = `send failed: ${e.message}`;
  }
});
clearBtn.addEventListener('click', () => { if (confirm('Forget every scan kept in this browser?')) { clearScans(); refreshSaved(); } });

refreshSaved();
