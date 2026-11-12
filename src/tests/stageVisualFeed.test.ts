import {afterEach,describe,it,expect,vi} from 'vitest';
import {fetchStageVisualFeed,selectStageVideo} from '../lib/stageVisualFeed';
import {verifyStageVisualIdentity} from '../lib/stageVisualIdentity';
import {generateKeyPairSync,sign} from 'node:crypto';
const original={...process.env};
afterEach(()=>{process.env={...original};vi.unstubAllGlobals();});
const file={width:1920,height:1080,file_type:'video/mp4',link:'https://videos.pexels.com/video-files/1/demo.mp4'};
describe('curated concert feed',()=>{
  it('paginates both sources and bounds cache pages instead of returning one fixed daily batch',async()=>{
    process.env.PEXELS_API_KEY='px';process.env.PIXABAY_API_KEY='pb';
    const urls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json(url.includes('pexels.com')?{videos:[{id:2,duration:20,url:'https://www.pexels.com/video/2/',video_files:[file]}]}:{hits:[{id:3,duration:15,pageURL:'https://pixabay.com/videos/3/',videos:{large:{width:1920,height:1080,url:'https://cdn.pixabay.com/video/3.mp4'}}}]});}));
    const result=await fetchStageVisualFeed('rain',2);expect(result.page).toBe(2);expect(result.videos).toHaveLength(2);
    expect(urls.every(url=>new URL(url).searchParams.get('page')==='2')).toBe(true);
    await expect(fetchStageVisualFeed('rain',26)).rejects.toThrow();expect(urls).toHaveLength(2);
  });
  it('calls both sources and returns interleaved Full HD MP4s without downloading files',async()=>{
    process.env.PEXELS_API_KEY='test-px';process.env.PIXABAY_API_KEY='test-pb';
    const urls:string[]=[];
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json(url.includes('pexels.com')?{videos:[{id:1,duration:20,url:'https://www.pexels.com/video/1/',user:{name:'A'},video_files:[{...file,width:3840,height:2160},file]}]}:{hits:[{id:2,duration:15,pageURL:'https://pixabay.com/videos/2/',user:'B',videos:{medium:{width:1920,height:1080,url:'https://cdn.pixabay.com/video/2.mp4',size:1000000}}}]});}));
    const feed=await fetchStageVisualFeed('galaxies');expect(feed.videos.map(video=>video.id)).toEqual(['px:1','pb:2']);expect(urls).toHaveLength(2);expect(feed.videos.every(video=>video.width===1920)).toBe(true);
    expect(JSON.stringify(feed)).not.toContain('test-px');expect(JSON.stringify(feed)).not.toContain('test-pb');
  });
  it('keeps the second source working if the first fails, and rejects unknown topics before fetch',async()=>{
    process.env.PEXELS_API_KEY='px';process.env.PIXABAY_API_KEY='pb';
    const mock=vi.fn(async(url:string)=>{if(url.includes('pexels.com'))throw Error('offline');return Response.json({hits:[{id:2,duration:15,pageURL:'https://pixabay.com/videos/2/',user:'B',videos:{medium:{width:1920,height:1080,url:'https://cdn.pixabay.com/video/2.mp4'}}}]});});vi.stubGlobal('fetch',mock);
    expect((await fetchStageVisualFeed('abstract')).videos[0].id).toBe('pb:2');
    await expect(fetchStageVisualFeed('not-a-topic' as any)).rejects.toThrow();expect(mock).toHaveBeenCalledTimes(2);
  });
  it('rejects SD and 4K and recovers from an empty later page',async()=>{
    expect(selectStageVideo([{...file,width:1280,height:720},{...file,width:3840,height:2160}])).toBeUndefined();
    process.env.PEXELS_API_KEY='px';delete process.env.PIXABAY_API_KEY;
    const mock=vi.fn(async(url:string)=>Response.json(url.includes('page=1')?{videos:[{id:1,duration:20,url:'https://www.pexels.com/video/1/',video_files:[file]}]}:{videos:[]}));vi.stubGlobal('fetch',mock);
    expect((await fetchStageVisualFeed('galaxies',5)).videos).toHaveLength(1);expect(mock).toHaveBeenCalledTimes(2);
  });
  it('verifies signatures and rejects forged, expired, wrong-project and wrong-environment identities',async()=>{
    const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
    const jwk={...publicKey.export({format:'jwk'}),kid:'test-key'};
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({keys:[jwk]})));
    const now=Date.now(),claims={iss:'https://oidc.vercel.com',aud:'https://vercel.com/juan-s-projects-001ec0d9',owner_id:'team_PS4pTA3XpqLS6fxNT9hoyktN',project_id:'prj_hAV6ZXwSyC3XbHAOSaH13Xd1hkUm',environment:'production',iat:Math.floor(now/1000)-10,exp:Math.floor(now/1000)+600};
    const token=(patch={})=>{const parts=[Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url'),Buffer.from(JSON.stringify({...claims,...patch})).toString('base64url')];return `${parts.join('.')}.${sign('RSA-SHA256',Buffer.from(parts.join('.')),privateKey).toString('base64url')}`;};
    expect(await verifyStageVisualIdentity(token(),now)).toBe(true);
    for(const patch of [{exp:1},{project_id:'other'},{owner_id:'other'},{environment:'development'},{aud:'other'}])expect(await verifyStageVisualIdentity(token(patch),now)).toBe(false);
    expect(await verifyStageVisualIdentity(token().replace(/.$/,'!'),now)).toBe(false);expect(await verifyStageVisualIdentity('not-a-jwt',now)).toBe(false);
  });
});
