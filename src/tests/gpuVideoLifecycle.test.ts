import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { finishGpuJob, getGpuManifest, cleanupExpiredComputeJobs } from '../lib/gpu/orchestrator';
const state = vi.hoisted(() => ({ job:null as any, destroy:vi.fn(), inserted:vi.fn(), admin:vi.fn() }));
vi.mock('../lib/gpu/jobStore', async (original) => ({
 ...(await original<any>()),
 getGpuJob:async()=>state.job,
 getGpuJobForUser:async()=>state.job,
 getGalleryItemById:async()=>({id:'gallery',url:'https://storage.example/video.mp4'}),
 updateGpuJob:async(_id:string,patch:any)=>(state.job={...state.job,...patch}),
 listExpiredGpuJobs:async()=>Date.parse(state.job.lease_expires_at)<=Date.now()?[state.job]:[],
 getGpuSupabaseAdmin:()=>state.admin(),
}));
vi.mock('../lib/gpu/videoSession', async (original) => ({
 ...(await original<any>()),
 updateVideoSession:async(old:any,patch:any)=> {
   if(old.metadata.videoSession.phase!==state.job.metadata.videoSession.phase || old.metadata.videoSession.generationId!==state.job.metadata.videoSession.generationId)return null;
   return state.job={...state.job,...patch};
 },
}));
vi.mock('../lib/r2',()=>({createR2StorageUrl:()=> 'https://storage.example/video.mp4',headR2Object:async()=>({contentLength:5000,contentType:'video/mp4'}),createR2PresignedGetUrl:()=>({url:'https://storage.example/read'}),createR2PresignedPutUrl:()=>({uploadUrl:'https://storage.example/write',key:'output',contentType:'video/mp4'})}));
vi.mock('../lib/gpu/vastApi',async(original)=>({...await original<any>(),destroyVastInstance:state.destroy}));
const token='test-token';
beforeEach(()=>{
 vi.clearAllMocks();
 state.job={id:'job',user_id:'owner',project_id:'project',thread_id:'chat',provider:'vast',workload:'video',status:'processing',instance_id:123,callback_token_hash:createHash('sha256').update(token).digest('hex'),started_at:new Date().toISOString(),created_at:new Date().toISOString(),hourly_price:0.3,lease_expires_at:new Date(Date.now()+1200000).toISOString(),output_url:'https://storage.example/video.mp4',metadata:{outputKey:'output',request:{recipe:'wan22-image-to-video',prompt:'Move gently',inputUrls:['https://image.example/a.png']},videoSession:{phase:'generating',generationId:'clip-a',clips:0,hardDeadline:new Date(Date.now()+1200000).toISOString(),clipStartedAt:new Date().toISOString()}}};
 state.admin.mockReturnValue({from:()=>({select:()=>{const query:any={eq:()=>query,then:(resolve:any)=>resolve({count:0,error:null})};return query;},insert:(item:any)=>{state.inserted(item);return {select:()=>({single:async()=>({data:{id:'gallery'},error:null})})};}})});
});
it('saves a finished clip and waits with the same live GPU',async()=>{
 const job=await finishGpuJob({jobId:'job',token,status:'completed',metadata:{generationId:'clip-a'}});
 expect(job.videoSession?.phase).toBe('idle');expect(job.videoSession?.clips).toBe(1);
 expect(state.inserted).toHaveBeenCalledOnce();expect(state.destroy).not.toHaveBeenCalled();
 expect(Date.parse(state.job.lease_expires_at)-Date.now()).toBeLessThanOrEqual(120000);
 expect((await getGpuManifest({jobId:'job',token})).action).toBe('wait');
});
it('ignores a duplicate callback and a failure from an older generation',async()=>{
 await finishGpuJob({jobId:'job',token,status:'completed',metadata:{generationId:'clip-a'}});
 await finishGpuJob({jobId:'job',token,status:'completed',metadata:{generationId:'clip-a'}});
 state.job.metadata.videoSession={...state.job.metadata.videoSession,phase:'generating',generationId:'clip-b'};
 await finishGpuJob({jobId:'job',token,status:'failed',metadata:{generationId:'clip-a'}});
 expect(state.inserted).toHaveBeenCalledOnce();expect(state.job.metadata.videoSession.phase).toBe('generating');expect(state.destroy).not.toHaveBeenCalled();
});
it('destroys an expired idle instance and preserves the successful video',async()=>{
 await finishGpuJob({jobId:'job',token,status:'completed',metadata:{generationId:'clip-a'}});
 state.job.lease_expires_at=new Date(Date.now()-1000).toISOString();
 await cleanupExpiredComputeJobs();
 expect(state.destroy).toHaveBeenCalledWith(123);expect(state.job.status).toBe('completed');expect(state.job.gallery_item_id).toBe('gallery');expect(state.job.destroyed_at).toBeTruthy();
});
it('rejects an invalid worker credential before revealing the manifest',async()=>{
 await expect(getGpuManifest({jobId:'job',token:'foreign'})).rejects.toThrow('Token GPU inválido');
});
