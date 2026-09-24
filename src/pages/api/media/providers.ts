import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { MEDIA_CAPABILITY_CATALOG } from '../../../lib/mediaProviders/capabilities';
import { providerCanExecuteAction } from '../../../lib/mediaProviders/execution';
import { getAvailableProvidersForAction, type NaylaAction } from '../../../lib/naylaActions';
import { getNaylaPublicSystemCatalog } from '../../../lib/naylaSystemCatalog';

type GenerarRouteKey = 'imagen' | 'video' | 'audio' | 'musica' | '3d';
type StockRouteKey = 'imagen' | 'video' | 'audio';

const GENERAR_ROUTE_ACTIONS: Record<GenerarRouteKey, NaylaAction> = {
  imagen: {
    action: 'GENERATE_IMAGE',
    prompt: 'availability-check',
  },
  video: {
    action: 'GENERATE_VIDEO',
    prompt: 'availability-check',
  },
  audio: {
    action: 'GENERATE_AUDIO',
    mode: 'tts',
    text: 'availability-check',
    targetLanguage: 'es',
  },
  musica: {
    action: 'GENERATE_AUDIO',
    mode: 'music',
    prompt: 'availability-check',
  },
  '3d': {
    action: 'GENERATE_3D',
    mode: 'text_to_3d',
    prompt: 'availability-check',
  },
};

const STOCK_ROUTE_ACTIONS: Record<StockRouteKey, NaylaAction> = {
  imagen: {
    action: 'SEARCH_MEDIA',
    query: 'availability-check',
    kind: 'image',
    limit: 1,
  },
  video: {
    action: 'SEARCH_MEDIA',
    query: 'availability-check',
    kind: 'video',
    limit: 1,
  },
  audio: {
    action: 'SEARCH_MEDIA',
    query: 'availability-check',
    kind: 'audio',
    limit: 1,
  },
};

const getGenerarRoutes = (): Record<GenerarRouteKey, boolean> =>
  Object.fromEntries(
    Object.entries(GENERAR_ROUTE_ACTIONS).map(([key, action]) => [
      key,
      getAvailableProvidersForAction(action).some((provider) =>
        providerCanExecuteAction(provider.id, action)
      ),
    ])
  ) as Record<GenerarRouteKey, boolean>;

const getStockRoutes = (): Record<StockRouteKey, boolean> =>
  Object.fromEntries(
    Object.entries(STOCK_ROUTE_ACTIONS).map(([key, action]) => [
      key,
      getAvailableProvidersForAction(action).length > 0,
    ])
  ) as Record<StockRouteKey, boolean>;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Usa GET.' });
  }

  try {
    await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({
    system: getNaylaPublicSystemCatalog(),
    capabilities: MEDIA_CAPABILITY_CATALOG.map((item) => ({
      id: item.id,
      label: item.label,
      group: item.group,
      requiresConsent: Boolean(item.requiresConsent),
    })),
    generarRoutes: getGenerarRoutes(),
    stockRoutes: getStockRoutes(),
  });
}
