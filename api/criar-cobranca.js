export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { amount, nome, email } = req.body || {};

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Valor inválido' });
  }

  const EXPAY_KEY  = process.env.EXPAY_KEY;
  const STORE_ID   = process.env.EXPAY_STORE_ID || 'a288ca60-0128-4073-86b0-885cb54dc668';
  const EXPAY_BASE = 'https://api-core.leventechnology.com/api/v1';

  try {
    const idempotencyKey = `paraiso-doe-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const response = await fetch(`${EXPAY_BASE}/charges`, {
      method: 'POST',
      headers: {
        'X-API-Key': EXPAY_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        amount,
        currency: 'BRL',
        payment_method: 'pix',
        store_id: STORE_ID,
        reference: `DOA-PARAISO-${Date.now()}`,
        charge_description: `Doação R$ ${amount.toFixed(2).replace('.', ',')} - PARAÍSO DOS FOCINHOS`,
        customer: {
          name: nome || 'Doador',
          email: email || 'doador@paraisodosfocinhos.online',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: 'Erro ao criar cobrança', detail: err.slice(0, 200) });
    }

    const data = await response.json();

    return res.status(200).json({
      id: data.id,
      status: data.status,
      amount: data.amount,
      pix: {
        copy_paste: data.pix_data?.copy_paste,
        qr_code_base64: data.pix_data?.qr_code_base64,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detail: e.message });
  }
}
