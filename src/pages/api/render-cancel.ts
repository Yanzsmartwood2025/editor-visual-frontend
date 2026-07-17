import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Usa DELETE.' });

  try {
    const { jobId } = req.query;
    if (!jobId) return res.status(400).json({ error: 'Falta el parámetro jobId.' });

    const oracleUrl = process.env.ORACLE_SERVER_URL || 'https://oracle-api.132.145.184.192.sslip.io';
    const oracleSecret = process.env.ORACLE_SECRET || '';

    // Llamamos al microservicio Oracle Service que maneja la cancelación
    const response = await fetch(`${oracleUrl}/api/render-cancel/${jobId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${oracleSecret}`
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `Oracle error: ${errorText}` });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error: unknown) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error en proxy de cancelación de render.' });
  }
}
