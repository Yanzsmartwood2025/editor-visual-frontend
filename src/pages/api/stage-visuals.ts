import type {NextApiRequest,NextApiResponse} from 'next';
import {unstable_cache} from 'next/cache';
import {isStageStockTopic} from '../../lib/stageVisualCatalog';
import {fetchStageVisualFeed} from '../../lib/stageVisualFeed';
import {verifyStageVisualIdentity} from '../../lib/stageVisualIdentity';

// A persistent 24-hour search cache also applies when the function cold-starts.
const cachedFeed=unstable_cache(fetchStageVisualFeed,['stage-visuals-v1'],{revalidate:86400});
export default async function handler(req:NextApiRequest,res:NextApiResponse){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'No pude abrir estos fondos.'});}
  const authorization=req.headers.authorization;
  const token=authorization?.startsWith('Bearer ')?authorization.slice(7):req.headers['x-vercel-trusted-oidc-idp-token'];
  let identityFailure='rejected';
  if(!await verifyStageVisualIdentity(token,Date.now(),reason=>{identityFailure=reason;})){
    res.setHeader('X-Stage-Identity',identityFailure);return res.status(401).json({error:'No pude autorizar los fondos.'});
  }
  const topic=req.query.topic;
  if(!isStageStockTopic(topic)||Object.keys(req.query).some(key=>key!=='topic'))return res.status(400).json({error:'Elige un tema disponible.'});
  try{
    // One stable page per day; callers cannot generate unlimited cache keys.
    const page=1+Math.floor(Date.now()/86400000)%5;
    return res.status(200).json(await cachedFeed(topic,page));
  }catch(error){
    console.warn('[stage-feed]',error instanceof Error?error.message:'unavailable');
    return res.status(503).json({error:'No pude traer nuevos fondos ahora. Los anteriores siguen disponibles.'});
  }
}
