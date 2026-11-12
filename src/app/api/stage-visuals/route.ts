import {unstable_cache} from 'next/cache';
import {isStageStockTopic,parseStageStockPage} from '../../../lib/stageVisualCatalog';
import {fetchStageVisualFeed} from '../../../lib/stageVisualFeed';
import {verifyStageVisualIdentity} from '../../../lib/stageVisualIdentity';

export const runtime='nodejs';
// App Router supplies the persistent incremental-cache context on Vercel.
const cachedFeed=unstable_cache(fetchStageVisualFeed,['stage-visuals-v2'],{revalidate:86400});
const privateHeaders={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
  const authorization=request.headers.get('authorization');
  const token=authorization?.startsWith('Bearer ')?authorization.slice(7):request.headers.get('x-vercel-trusted-oidc-idp-token');
  let identityFailure='rejected';
  if(!await verifyStageVisualIdentity(token,Date.now(),reason=>{identityFailure=reason;}))return Response.json({error:'No pude autorizar los fondos.'},{status:401,headers:{...privateHeaders,'X-Stage-Identity':identityFailure}});
  const params=new URL(request.url).searchParams,topic=params.get('topic');
  const page=parseStageStockPage(params.get('page'));
  if(!isStageStockTopic(topic)||page===null||[...params.keys()].some(key=>!['topic','page'].includes(key)))return Response.json({error:'Elige un tema disponible.'},{status:400,headers:privateHeaders});
  try{
    return Response.json(await cachedFeed(topic,page),{headers:privateHeaders});
  }catch(error){
    console.warn('[stage-feed]',error instanceof Error?error.message:'unavailable');
    return Response.json({error:'No pude traer nuevos fondos ahora. Los anteriores siguen disponibles.'},{status:503,headers:privateHeaders});
  }
}
