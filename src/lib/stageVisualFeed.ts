import {isStageStockTopic,STAGE_STOCK_TOPICS,STAGE_STOCK_MAX_PAGE,validateStageStockClips,type StageStockClip,type StageStockTopic} from './stageVisualCatalog';

type RecordValue = Record<string, any>;
function mediaHost(url:unknown){try{return new URL(typeof url==='string'?url:'').hostname;}catch{return null;}}
/** Full HD variants only; 4K files are deliberately excluded from the stage decoder. */
export function selectStageVideo(files:RecordValue[]):RecordValue|undefined {
  return files.filter(file=>Number(file.width)>=1920&&Number(file.height)>=1080&&Number(file.width)<=2560&&Number(file.height)<=1440&&Number(file.width)>Number(file.height)&&
    (!file.file_type||file.file_type==='video/mp4')&&(!file.size||Number(file.size)<=32*1024*1024))
    .sort((a,b)=>Number(a.width)*Number(a.height)-Number(b.width)*Number(b.height))[0];
}
async function readJson(url:string,headers?:Record<string,string>):Promise<RecordValue>{
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!response.ok)throw Object.assign(Error(`Media search unavailable: ${response.status}`),{status:response.status});
  return response.json();
}
async function searchPexels(topic:StageStockTopic,page:number):Promise<StageStockClip[]>{
  const key=process.env.PEXELS_API_KEY?.trim();if(!key)return [];
  const query=STAGE_STOCK_TOPICS.find(([id])=>id===topic)![2];
  const params=new URLSearchParams({query,per_page:'20',page:String(page),orientation:'landscape',size:'medium'});
  let data=await readJson(`https://api.pexels.com/v1/videos/search?${params}`,{Authorization:key}).catch(error=>{
    if(page<=1||error?.status!==400)throw error;
    params.set('page','1');return readJson(`https://api.pexels.com/v1/videos/search?${params}`,{Authorization:key});
  });
  if(page>1&&(!Array.isArray(data.videos)||!data.videos.length)){params.set('page','1');data=await readJson(`https://api.pexels.com/v1/videos/search?${params}`,{Authorization:key});}
  return (Array.isArray(data.videos)?data.videos:[]).map((video:RecordValue)=>{
    const file=selectStageVideo(Array.isArray(video.video_files)?video.video_files:[]);
    return {id:`px:${video.id}`,url:file?.link,width:Number(file?.width),height:Number(file?.height),duration:Number(video.duration),
      author:String(video.user?.name||'Autor del fondo').slice(0,160),sourceUrl:video.url,licenseUrl:'https://www.pexels.com/license/'};
  });
}
async function searchPixabay(topic:StageStockTopic,page:number):Promise<StageStockClip[]>{
  const key=process.env.PIXABAY_API_KEY?.trim();if(!key)return [];
  const query=STAGE_STOCK_TOPICS.find(([id])=>id===topic)![2];
  const params=new URLSearchParams({key,q:query,per_page:'20',page:String(page),safesearch:'true'});
  let data=await readJson(`https://pixabay.com/api/videos/?${params}`).catch(error=>{
    if(page<=1||error?.status!==400)throw error;
    params.set('page','1');return readJson(`https://pixabay.com/api/videos/?${params}`);
  });
  if(page>1&&(!Array.isArray(data.hits)||!data.hits.length)){params.set('page','1');data=await readJson(`https://pixabay.com/api/videos/?${params}`);}
  return (Array.isArray(data.hits)?data.hits:[]).map((video:RecordValue)=>{
    const file=selectStageVideo(Object.values(video.videos||{}) as RecordValue[]);
    return {id:`pb:${video.id}`,url:file?.url,width:Number(file?.width),height:Number(file?.height),duration:Number(video.duration),
      author:String(video.user||'Autor del fondo').slice(0,160),sourceUrl:video.pageURL,licenseUrl:'https://pixabay.com/service/license-summary/'};
  });
}
/** Both sources run, even if the first already has enough results. No media is downloaded. */
export async function fetchStageVisualFeed(topic:StageStockTopic,page=1){
  if(!isStageStockTopic(topic)||!Number.isInteger(page)||page<1||page>STAGE_STOCK_MAX_PAGE)throw Error('Invalid stage topic');
  const batches=await Promise.allSettled([searchPexels(topic,page),searchPixabay(topic,page)]);
  const sources=batches.map(result=>result.status==='fulfilled'?validateStageStockClips(result.value):[]);
  console.info('[stage-feed]',JSON.stringify({topic,configured:[!!process.env.PEXELS_API_KEY?.trim(),!!process.env.PIXABAY_API_KEY?.trim()],sources:batches.map((result,index)=>result.status==='fulfilled'?{candidates:result.value.length,accepted:sources[index].length,sample:result.value.slice(0,2).map(clip=>({width:clip.width,height:clip.height,duration:clip.duration,host:mediaHost(clip.url)}))}:{error:result.reason instanceof Error?result.reason.message:'unavailable'})}));
  const videos:StageStockClip[]=[];
  for(let i=0;i<20;i++)for(const source of sources)if(source[i])videos.push(source[i]);
  if(!videos.length)throw Error('No usable stage videos');
  return {version:2,topic,page,videos:videos.slice(0,24),expiresAt:Date.now()+24*60*60*1000};
}
