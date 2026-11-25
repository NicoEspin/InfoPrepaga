// Isolated/staging CRM only: deliberately creates a synthetic lead.
const { createHmac, randomUUID } = require('node:crypto');
async function main() {
  const args = process.argv.slice(2);
  const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  const url = new URL(option('--url', 'http://127.0.0.1:3000/webhooks/ycloud'));
  if (url.pathname !== '/webhooks/ycloud' || !['http:', 'https:'].includes(url.protocol)) throw new Error('Use /webhooks/ycloud');
  const secret = process.env.YCLOUD_WEBHOOK_SECRET;
  const wabaId = process.env.YCLOUD_WABA_ID;
  const to = process.env.YCLOUD_BUSINESS_PHONE_NUMBER;
  if (!secret || !wabaId || !to) throw new Error('Missing signing/account variables');
  const id = option('--id', randomUUID());
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('Invalid synthetic identifier');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const raw = JSON.stringify({
    id: `evt_synthetic_${id}`, type: 'whatsapp.inbound_message.received', apiVersion: 'v2', createTime: new Date().toISOString(),
    whatsappInboundMessage: {
      id: `message_synthetic_${id}`, wamid: `wamid.synthetic.${id}`, wabaId, to,
      from: '14155550198', type: 'text', sendTime: new Date().toISOString(),
      customerProfile: { name: 'Prueba sintética YCloud' }, text: { body: 'Consulta sintética' },
      referral: { source_type: 'ad', source_id: 'ad_synthetic', source_url: 'https://example.com/ad', headline: 'Prueba sintética', ctwa_clid: 'click_synthetic' },
    },
  }, null, 2) + '\n';
  const signature = createHmac('sha256', secret).update(timestamp + '.').update(raw).digest('hex');
  const response = await fetch(url, { method: 'POST', body: raw, redirect: 'error', signal: AbortSignal.timeout(10000), headers: {
    'Content-Type': 'application/json', 'YCloud-Signature': `t=${timestamp},s=${signature}`,
  } });
  console.log(`HTTP ${response.status}; event=evt_synthetic_${id}`);
  const result = await response.json().catch(() => ({}));
  if (['accepted','duplicate'].includes(result.result)) console.log(result.result);
  if (!response.ok) process.exitCode = 1;
}
main().catch(() => { console.error('Synthetic delivery failed. Check URL and server configuration; no credentials were logged.'); process.exitCode = 1; });
