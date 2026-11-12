export type Tenant = {id:string;name:string;slug:string;created_at:string};
export type Profile = {id:string;name:string;email:string};
export type Session = {access_token:string;refresh_token:string;expires_at:number;profile:Profile;tenants:Tenant[]};
const key='nexo.session';
export const coreApiUrl=import.meta.env.VITE_CORE_API_URL||'http://localhost:8081';
export function readSession():Session|null{try{const raw=sessionStorage.getItem(key);return raw?JSON.parse(raw) as Session:null}catch{return null}}
export function saveSession(session:Session){sessionStorage.setItem(key,JSON.stringify(session))}
export function clearSession(){sessionStorage.removeItem(key)}
export function isSessionValid(session:Session|null){return !!session&&session.expires_at>Math.floor(Date.now()/1000)}
async function request<T>(path:string,init:RequestInit={}):Promise<T>{const response=await fetch(`${coreApiUrl}${path}`,{...init,headers:{'Content-Type':'application/json',...(init.headers||{})}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.message||body.code||'No se pudo completar la solicitud');return body as T}
export function login(email:string,password:string){return request<Omit<Session,'tenants'>>('/v1/auth/login',{method:'POST',body:JSON.stringify({email,password})})}
export function register(email:string,name:string,password:string){return request<{user:Profile}>('/v1/auth/register',{method:'POST',body:JSON.stringify({email,name,password})})}
export function createTenant(accessToken:string,name:string,slug?:string){return request<{tenant:Tenant}>('/v1/tenants',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`},body:JSON.stringify({name,slug})})}
export function me(accessToken:string){return request<{profile:Profile;tenants:Tenant[]}>('/v1/auth/me',{headers:{Authorization:`Bearer ${accessToken}`}})}
export async function hydrateSession(base:Omit<Session,'tenants'>|Session):Promise<Session>{const result=await me(base.access_token);const session={...base,profile:result.profile,tenants:result.tenants};saveSession(session);return session}
export async function logout(accessToken:string){await request('/v1/auth/logout',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`}})}
export type SidebarResponse={items:Array<{id:string;capabilities:string[]}>;role:string};
export function fetchSidebar(accessToken:string,tenantId?:string){const suffix=tenantId?`?tenant_id=${encodeURIComponent(tenantId)}`:'';return request<SidebarResponse>(`/v1/navigation/sidebar${suffix}`,{headers:{Authorization:`Bearer ${accessToken}`}})}
