import crypto from 'crypto';

export const config = {
  api: { bodyParser: false },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, header, secret) {
  if (!header) return false;

  // Strip whsec_ prefix if present (the actual HMAC key is the raw bytes)
  const keyBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');

  // Stripe-style: "t=<ts>,v1=<hex_sig>"
  const parts = {};
  header.split(',').forEach(p => {
    const [k, v] = p.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  });

  if (parts.t && parts.v1) {
    const payload = `${parts.t}.${rawBody.toString('utf8')}`;
    const expected = crypto
      .createHmac('sha256', keyBytes)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  }

  // Simple: header is just the hex/base64 HMAC of the raw body
  const expected = crypto
    .createHmac('sha256', keyBytes)
    .update(rawBody)
    .digest('hex');
  const candidate = header.replace(/^sha256=/, '');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate, 'hex'));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const rawBody = await getRawBody(req);

  const sigHeader =
    req.headers['x-expay-signature'] ||
    req.headers['x-webhook-signature'] ||
    req.headers['stripe-signature'] ||
    req.headers['svix-signature'] ||
    '';

  const secret = process.env.EXPAY_WEBHOOK_SECRET || '';
  const verified = secret ? verifySignature(rawBody, sigHeader, secret) : false;

  if (secret && !verified) {
    console.warn('[webhook-expay] Signature inválida — ignorando evento');
    // Retorna 200 para não causar reentregas desnecessárias enquanto não confirmamos o formato
    return res.status(200).json({ received: true, verified: false });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  console.log('[webhook-expay] Evento recebido:', event.event || event.type, '| ID:', event.id || event.charge_id);

  const tipo = event.event || event.type;

  if (tipo === 'charge.paid') {
    const charge = event.data || event;
    console.log(
      `[webhook-expay] DOAÇÃO CONFIRMADA | ID: ${charge.id} | Valor: R$${((charge.amount || 0) / 100).toFixed(2)} | Ref: ${charge.reference}`,
    );
    // Aqui você pode gravar no Supabase ou enviar notificação
  }

  if (tipo === 'charge.failed' || tipo === 'charge.expired') {
    const charge = event.data || event;
    console.log(`[webhook-expay] Cobrança falhou/expirou | ID: ${charge.id}`);
  }

  return res.status(200).json({ received: true, verified: !!verified });
}
