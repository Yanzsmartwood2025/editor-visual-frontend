import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoUrl, startTime, endTime, clipName } = req.body;

  if (!videoUrl || typeof videoUrl !== 'string') {
    return res.status(400).json({ error: 'URL no proporcionada o formato inválido.' });
  }

  const ORACLE_SERVER_URL = process.env.ORACLE_SERVER_URL || 'https://oracle-api.132.145.184.192.sslip.io';
  const ORACLE_SECRET = process.env.ORACLE_SECRET;

  if (!ORACLE_SERVER_URL || !ORACLE_SECRET) {
    console.error('[process-clip] ORACLE_SERVER_URL o ORACLE_SECRET no configurados.');
    return res.status(500).json({ error: 'El servicio de extracción (Oráculo) no está configurado.' });
  }

  try {
    console.log(`[process-clip] Delegando extracción a Oracle: ${ORACLE_SERVER_URL}/api/process-clip`);
    const oracleRes = await fetch(`${ORACLE_SERVER_URL}/api/process-clip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ORACLE_SECRET}`
      },
      body: JSON.stringify({ videoUrl, startTime, endTime, clipName }),
      signal: AbortSignal.timeout(10000)
    });

    if (oracleRes.status === 202) {
       return res.status(202).json({ message: 'Procesamiento de clip iniciado en segundo plano' });
    }

    const errorData = await oracleRes.json().catch(() => ({}));
    console.warn(`[process-clip] Oracle falló con status ${oracleRes.status}.`, errorData);
    return res.status(oracleRes.status).json(errorData);

  } catch (error: any) {
    console.error('[process-clip] Error conectando al Oráculo.', error);
    return res.status(500).json({ error: 'Error conectando al servicio de extracción (Oráculo).', details: error.message });
  }
}
