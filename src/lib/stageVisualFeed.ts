import {isStageStockTopic,STAGE_STOCK_TOPICS,validateStageStockClips,type StageStockClip,type StageStockTopic} from './stageVisualCatalog';

type RecordValue = Record<string, any>;
/** Full HD variants only; 4K files are deliberately excluded from the stage decoder. */
export function selectStageVideo(files:RecordValue[]):RecordValue|undefined {
  return files.filter(file=>Number(file.width)>=1920&&Number(file.height)>=1080&&Number(file.width)<=2560&&Number(file.height)<=1440&&Number(file.width)>Number(file.height)&&
    (!file.file_type||file.file_type==='video/mp4')&&(!file.size||Number(file.size)<=32*1024*1024))
    .sort((a,b)=>Number(a.width)*Number(a.height)-Number(b.width)*Number(b.height))[0];
}
async function readJson(url:string,headers?:Record<string,string>):Promise<RecordValue>{
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!response.ok)throw Error('Media search unavailable');
  return response.json();
}
async function searchPexels(topic:StageStockTopic,page:number):Promise<StageStockClip[]>{
  const key=process.env.PEXELS_API_KEY?.trim();if(!key)return [];
  const query=STAGE_STOCK_TOPICS.find(([id])=>id===topic)![2];
  const params=new URLSearchParams({query,per_page:'20',page:String(page),orientation:'landscape',size:'medium'});
  let data=await readJson(`https://api.pexels.com/v1/videos/search?${params}`,{Authorization:key});
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
  let data=await readJson(`https://pixabay.com/api/videos/?${params}`);
  if(page>1&&(!Array.isArray(data.hits)||!data.hits.length)){params.set('page','1');data=await readJson(`https://pixabay.com/api/videos/?${params}`);}
  return (Array.isArray(data.hits)?data.hits:[]).map((video:RecordValue)=>{
    const file=selectStageVideo(Object.values(video.videos||{}) as RecordValue[]);
    return {id:`pb:${video.id}`,url:file?.url,width:Number(file?.width),height:Number(file?.height),duration:Number(video.duration),
      author:String(video.user||'Autor del fondo').slice(0,160),sourceUrl:video.pageURL,licenseUrl:'https://pixabay.com/service/license-summary/'};
  });
}
/** Both sources run, even if the first already has enough results. No media is downloaded. */
export async function fetchStageVisualFeed(topic:StageStockTopic,page=1){
  if(!isStageStockTopic(topic)||!Number.isInteger(page)||page<1||page>5)throw Error('Invalid stage topic');
  const batches=await Promise.allSettled([searchPexels(topic,page),searchPixabay(topic,page)]);
  const sources=batches.map(result=>result.status==='fulfilled'?validateStageStockClips(result.value):[]);
  const videos:StageStockClip[]=[];
  for(let i=0;i<20;i++)for(const source of sources)if(source[i])videos.push(source[i]);
  if(!videos.length)throw Error('No usable stage videos');
  return {version:1,topic,videos:videos.slice(0,24),expiresAt:Date.now()+24*60*60*1000};
}
