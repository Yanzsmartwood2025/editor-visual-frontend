// @ts-nocheck
/* eslint-disable */
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  try {
    // Tomamos inputProps, que contiene el array timeline o props estáticos que pasaremos a remotion
    const { inputProps } = req.body;
    if (!inputProps) return res.status(400).json({ error: 'Faltan inputProps para el render.' });

    const oracleUrl = process.env.ORACLE_SERVER_URL || 'https://oracle-api.132.145.184.192.sslip.io';
    const oracleSecret = process.env.ORACLE_SECRET || '';

    // Llamamos al microservicio Oracle Service que maneja remotion
    const response = await fetch(`${oracleUrl}/api/render-remotion`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${oracleSecret}`
        },
        body: JSON.stringify({ inputProps })
    });

    if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `Oracle error: ${errorText}` });
    }

    const data = await response.json();
    // Respondemos HTTP 202 que dice que fue encolado
    return res.status(202).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error en proxy de renderizado.' });
  }
}
