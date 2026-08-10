const CLIENT_ID='3ac122f971744e508bfd33ad0637d421';
const SCOPES=['user-read-private','user-read-email','streaming','user-read-playback-state','user-modify-playback-state','user-library-read','user-library-modify','playlist-read-private','playlist-modify-private','playlist-modify-public'];
const KEYS={access:'spotify.accessToken',expires:'spotify.expiresAt',refresh:'spotify.refreshToken',verifier:'spotify.codeVerifier'};

function base64url(input){return btoa(String.fromCharCode(...new Uint8Array(input))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
async function sha256(text){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))}
function randomString(length=64){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~',values=crypto.getRandomValues(new Uint8Array(length));return Array.from(values,v=>chars[v%chars.length]).join('')}

export class AuthService{
  constructor({storage,bus}){this.storage=storage;this.bus=bus;this.redirectUri=new URL('callback.html',window.location.href).href}
  async login(){const verifier=randomString(),challenge=base64url(await sha256(verifier));this.storage.set(KEYS.verifier,verifier);const params=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:this.redirectUri,scope:SCOPES.join(' '),code_challenge_method:'S256',code_challenge:challenge,show_dialog:'true'});location.href=`https://accounts.spotify.com/authorize?${params}`}
  saveTokens(payload){this.storage.set(KEYS.access,payload.access_token);this.storage.set(KEYS.expires,Date.now()+payload.expires_in*1000-60000);if(payload.refresh_token)this.storage.set(KEYS.refresh,payload.refresh_token);this.bus.emit('auth:changed',{authenticated:true})}
  clear(){Object.values(KEYS).forEach(k=>this.storage.remove(k));this.bus.emit('auth:changed',{authenticated:false})}
  async refresh(){const refreshToken=this.storage.get(KEYS.refresh,null);if(!refreshToken)return null;const response=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,grant_type:'refresh_token',refresh_token:refreshToken})});if(!response.ok){this.clear();return null}const payload=await response.json();this.saveTokens(payload);return payload.access_token}
  async token(){const token=this.storage.get(KEYS.access,null),expires=Number(this.storage.get(KEYS.expires,0));return token&&Date.now()<expires?token:this.refresh()}
  isAuthenticated(){return Boolean(this.storage.get(KEYS.access,null)||this.storage.get(KEYS.refresh,null))}
}

export const spotifyClientId=CLIENT_ID;