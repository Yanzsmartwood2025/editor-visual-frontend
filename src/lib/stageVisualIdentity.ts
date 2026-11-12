import {createPublicKey,verify,type JsonWebKey} from 'node:crypto';

const TEAM='team_PS4pTA3XpqLS6fxNT9hoyktN';
const PROJECT='prj_hAV6ZXwSyC3XbHAOSaH13Xd1hkUm';
const ISSUERS=['https://oidc.vercel.com/juan-s-projects-001ec0d9','https://oidc.vercel.com'];
const keys=new Map<string,{expires:number;keys:(JsonWebKey&{kid?:string})[]}>();
/** A signed, short-lived identity for the stage project; no copied provider secrets. */
export async function verifyStageVisualIdentity(token:unknown,now=Date.now(),onFailure:(reason:string)=>void=()=>{}):Promise<boolean>{
  const deny=(reason:string)=>{onFailure(reason);return false;};
  if(typeof token!=='string'||token.length>16000)return deny('missing');
  try{
    const pieces=token.split('.');if(pieces.length!==3)return deny('format');
    const header=JSON.parse(Buffer.from(pieces[0],'base64url').toString());
    const claims=JSON.parse(Buffer.from(pieces[1],'base64url').toString());
    if(header.alg!=='RS256'||typeof header.kid!=='string'||!ISSUERS.includes(claims.iss))return deny('issuer');
    const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
    if(!audiences.includes('https://vercel.com/juan-s-projects-001ec0d9'))return deny('audience');
    if(claims.owner_id!==TEAM||claims.project_id!==PROJECT||!['production','preview'].includes(claims.environment))return deny('claims');
    if(!Number.isFinite(claims.exp)||claims.exp*1000<=now||!Number.isFinite(claims.iat)||claims.iat*1000>now+30000||claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf*1000>now+30000))return deny('expiry');
    let jwks=keys.get(claims.iss);
    if(!jwks||jwks.expires<=now){
      const response=await fetch(`${claims.iss}/.well-known/jwks`,{signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok)return deny('keys');
      const data=await response.json();if(!Array.isArray(data.keys))return deny('keys');
      jwks={expires:now+3600000,keys:data.keys};keys.set(claims.iss,jwks);
    }
    const jwk=jwks.keys.find(key=>key.kid===header.kid&&key.kty==='RSA');if(!jwk)return deny('keys');
    return verify('RSA-SHA256',Buffer.from(`${pieces[0]}.${pieces[1]}`),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(pieces[2],'base64url'))||deny('signature');
  }catch{return deny('unavailable');}
}
