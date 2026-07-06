import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL no proporcionada o formato inválido.' });
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return res.status(400).json({ error: 'La URL debe usar el protocolo HTTP o HTTPS.' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Formato de URL inválido.' });
  }

  const ORACLE_SERVER_URL = process.env.ORACLE_SERVER_URL || 'http://oracle-service:3001';
  const ORACLE_SECRET = process.env.ORACLE_SECRET;

  if (!ORACLE_SERVER_URL || !ORACLE_SECRET) {
    console.error('[extract-video] ORACLE_SERVER_URL o ORACLE_SECRET no configurados.');
    return res.status(500).json({ error: 'El servicio de extracción (Oráculo) no está configurado.' });
  }

  // Delegar todo al Oráculo
  try {
    console.log(`[extract-video] Delegando extracción a Oracle: ${ORACLE_SERVER_URL}/api/extract-meta`);
    const oracleRes = await fetch(`${ORACLE_SERVER_URL}/api/extract-meta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ORACLE_SECRET}`
      },
      body: JSON.stringify({ url }),
      // Agregamos un timeout más largo (60s) ya que el Oráculo podría estar descargando/subiendo o usando IA
      signal: AbortSignal.timeout(60000)
    });

    if (oracleRes.ok) {
      const oracleData = await oracleRes.json();
      if (oracleData.videoUrl) {
        console.log(`[extract-video] Extracción exitosa desde Oracle: ${oracleData.videoUrl}`);
        return res.status(200).json({ videoUrl: oracleData.videoUrl });
      }
    }

    // Si llegamos acá, Oracle devolvió un error (ej 404, 500)
    const errorData = await oracleRes.json().catch(() => ({}));
    console.warn(`[extract-video] Oracle falló con status ${oracleRes.status}.`, errorData);
    return res.status(oracleRes.status).json(errorData);

  } catch (oracleError: any) {
    console.error('[extract-video] Error conectando al Oráculo.', oracleError);
    return res.status(500).json({ error: 'Error conectando al servicio de extracción (Oráculo).', details: oracleError.message });
  }
}
