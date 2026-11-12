import type {ReactNode} from 'react';
import {useEffect,useState} from 'react';
export function useLocation(){const[path,setPath]=useState(window.location.pathname);useEffect(()=>{const handler=()=>setPath(window.location.pathname);window.addEventListener('popstate',handler);return()=>window.removeEventListener('popstate',handler)},[]);return{pathname:path}}
export function useNavigate(){return(path:string)=>{window.history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'))}}
export function Routes({children}:{children:ReactNode}){return <>{children}</>}
export function Route({path,element}:{path:string;element:ReactNode}){const location=useLocation();const known=location.pathname==='/'||location.pathname.startsWith('/onsite');const matches=path==='*'?!known:(path.endsWith('/*')?location.pathname===path.slice(0,-2)||location.pathname.startsWith(path.slice(0,-1)):location.pathname===path);return matches?<>{element}</>:null}
