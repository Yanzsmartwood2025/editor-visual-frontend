/** Shared with Nayla's curated feed. Keys bound the API cache; no arbitrary searches. */
export const STAGE_STOCK_TOPICS = [
  ['galaxies', 'Galaxias y nebulosas', 'galaxy'],
  ['planets', 'Planetas y estrellas', 'planets'],
  ['abstract', 'Animaciones abstractas', 'abstract'],
  ['neon', 'Neón y túneles', 'neon tunnel'],
  ['particles', 'Partículas y luces', 'light particles'],
  ['concert', 'Luces de concierto', 'concert lights'],
  ['city', 'Ciudades de noche', 'city night'],
  ['architecture', 'Arquitectura', 'architecture'],
  ['ocean', 'Océanos y olas', 'ocean'],
  ['underwater', 'Vida submarina', 'underwater'],
  ['wildlife', 'Animales', 'wildlife'],
  ['forest', 'Bosques', 'forest'],
  ['mountains', 'Nevados y montañas', 'snow mountains'],
  ['volcano', 'Volcanes y lava', 'volcano'],
  ['desert', 'Desiertos', 'desert'],
  ['rivers', 'Ríos y cascadas', 'waterfall'],
  ['aurora', 'Auroras y polos', 'aurora'],
  ['clouds', 'Cielos y tormentas', 'clouds'],
  ['sunset', 'Atardeceres', 'sunset'],
  ['flowers', 'Flores y detalles', 'flowers'],
  ['fire', 'Fuego', 'fire'],
  ['ink', 'Colores y líquidos', 'ink water'],
  ['fireworks', 'Fuegos artificiales', 'fireworks'],
  ['technology', 'Tecnología', 'technology'],
] as const;
export type StageStockTopic = typeof STAGE_STOCK_TOPICS[number][0];
export type StageStockClip = {
  id:string; url:string; width:number; height:number; duration:number;
  author:string; sourceUrl:string; licenseUrl:string;
};
export function isStageStockTopic(value:unknown):value is StageStockTopic {
  return STAGE_STOCK_TOPICS.some(([id])=>id===value);
}
/** Only known media hosts can become GPU textures. Never proxy arbitrary URLs. */
export function isStageStockUrl(value:unknown):value is string {
  if(typeof value!=='string'||value.length>2048)return false;
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&
      ['videos.pexels.com','player.vimeo.com','player.vimeo.com.cdn.cloudflare.net','cdn.pixabay.com'].includes(url.hostname)&&
      /\.mp4$/i.test(url.pathname);
  }catch{return false;}
}
export function validateStageStockClips(value:unknown):StageStockClip[] {
  if(!Array.isArray(value))return [];
  const seen=new Set<string>();
  return value.slice(0,40).filter((clip):clip is StageStockClip=>{
    if(!clip||typeof clip!=='object'||typeof clip.id!=='string'||clip.id.length>100||seen.has(clip.id)||!isStageStockUrl(clip.url))return false;
    if(!Number.isFinite(clip.width)||!Number.isFinite(clip.height)||clip.width<1920||clip.height<1080||clip.width>2560||clip.height>1440||clip.width<=clip.height)return false;
    if(!Number.isFinite(clip.duration)||clip.duration<5||clip.duration>45)return false;
    if(typeof clip.author!=='string'||clip.author.length>160)return false;
    for(const key of ['sourceUrl','licenseUrl'] as const){
      if(typeof clip[key]!=='string'||clip[key].length>2048)return false;
      try{const url=new URL(clip[key]);if(url.protocol!=='https:'||!['www.pexels.com','www.pixabay.com','pixabay.com'].includes(url.hostname))return false;}catch{return false;}
    }
    seen.add(clip.id);return true;
  });
}
