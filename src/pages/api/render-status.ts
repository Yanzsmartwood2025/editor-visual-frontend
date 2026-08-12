
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

  try {
    const { jobId } = req.query;
    if (!jobId) return res.status(400).json({ error: 'Falta el parámetro jobId.' });

    const oracleUrl = process.env.ORACLE_SERVER_URL;
    if (!oracleUrl) {
        throw new Error('ORACLE_SERVER_URL no configurado en .env');
    }
    const oracleSecret = process.env.ORACLE_SECRET || '';

    // Llamamos al microservicio Oracle Service que maneja el estado del job
    const response = await fetch(`${oracleUrl}/api/render-status/${jobId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${oracleSecret}`
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Oracle error: ${errorText}`);
        return res.status(200).json({
          status: 'failed',
          error: 'Render no encontrado, cancelado automáticamente'
        });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error: unknown) {
    console.error('Error en proxy de estado de renderizado:', error);
    return res.status(200).json({
      status: 'failed',
      error: 'Render no encontrado, cancelado automáticamente'
    });
  }
}
