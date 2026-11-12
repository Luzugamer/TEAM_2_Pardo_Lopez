import {useEffect,useMemo,useState} from 'react';
import type {ComponentType} from 'react';
import {useLocation,useNavigate} from './router';
import {AuthPage} from '../auth/AuthPage';
import {clearSession,fetchSidebar,isSessionValid,logout,readSession} from '../core/session';
import type {Session,SidebarResponse} from '../core/session';
import {useI18n} from '../core/i18n';
import {translateEvents} from '../core/events-i18n';
import {MobileMenuButton,Sidebar} from '../design-system/organisms';
import {Button,Card} from '../design-system/atoms';
import {PageHeading,EmptyState} from '../design-system/molecules';
import {findModuleForRoute,moduleRegistry,visibleModules} from '../platform/microfrontends/registry';
import type {Capability,MicrofrontendManifest,ModuleContext} from '../platform/microfrontends/contracts';
const demoEvents = import.meta.env.DEV && import.meta.env.VITE_EVENTS_DEMO === 'true';
const baseCapabilities:ModuleContext['capabilities']=['onsite:read','onsite:checkin','reports:read'];
export function AppShell(){
 const navigate=useNavigate(),location=useLocation(),{t}=useI18n();
 const [session,setSession]=useState<Session|null>(()=>readSession());const [collapsed,setCollapsed]=useState(false);const [mobileOpen,setMobileOpen]=useState(false);const [theme,setTheme]=useState<'light'|'dark'>('light');const [serverSidebar,setServerSidebar]=useState<SidebarResponse|null>(null);const [activeTenantId,setActiveTenantId]=useState(()=>readSession()?.tenants[0]?.id||'');
 const authenticated=isSessionValid(session),publicRoute=location.pathname==='/login';
 useEffect(()=>{document.documentElement.dataset.theme=theme},[theme]);
 useEffect(()=>{if(!authenticated&&!publicRoute)navigate('/login');if(authenticated&&publicRoute)navigate('/')},[authenticated,publicRoute,navigate]);
 useEffect(()=>{if(!session||!authenticated)return;fetchSidebar(session.access_token,activeTenantId).then(result=>setServerSidebar(result)).catch(()=>setServerSidebar(null))},[authenticated,session,activeTenantId]);
 const capabilities=useMemo<ModuleContext['capabilities']>(()=>{
  const serverEventCaps=(serverSidebar?.items.find(item=>item.id==='events')?.capabilities||[]).filter((cap):cap is Capability=>cap.startsWith('events:'));
  const fallbackDemoCaps:Capability[]=demoEvents&&serverEventCaps.length===0?(serverSidebar?.role==='member'?['events:read']:['events:read','events:write','events:publish']):[];
  return [...baseCapabilities,...serverEventCaps,...fallbackDemoCaps];
 },[serverSidebar]);
 const modules=useMemo(()=>{const capable=visibleModules(capabilities);return serverSidebar?capable.filter(module=>serverSidebar.items.some(item=>item.id===module.id)||(demoEvents&&module.id==='events')):capable},[serverSidebar,capabilities]);
 if(!session||!authenticated)return <AuthPage onAuthenticated={value=>{setSession(value);setActiveTenantId(value.tenants[0]?.id||'');navigate('/')}}/>;
 const tenant=session.tenants.find(item=>item.id===activeTenantId)||session.tenants[0];const context:ModuleContext={version:1,tenantId:tenant?.id||'',workspaceId:tenant?.id||'',capabilities,apiBaseUrl:import.meta.env.VITE_TEAM4_API_URL||'http://localhost:8082',theme,route:location.pathname};const active=location.pathname==='/'?'overview':findModuleForRoute(location.pathname,modules)?.id||'';
 const signOut=async()=>{try{await logout(session.access_token)}catch{}clearSession();setSession(null);navigate('/login')};
 return <div className={`nx-app ${mobileOpen?'is-mobile-open':''}`}><button className="nx-mobile-scrim" aria-label={t('nav.main')} onClick={()=>setMobileOpen(false)}/><Sidebar modules={modules} active={active} activeRoute={location.pathname} collapsed={collapsed} onNavigate={path=>{navigate(path);setMobileOpen(false)}} onToggle={()=>setCollapsed(value=>!value)} theme={theme} onTheme={()=>setTheme(value=>value==='light'?'dark':'light')} onLogout={signOut} tenants={session.tenants} activeTenantId={tenant.id} onTenantChange={setActiveTenantId} profile={{name:session.profile.name,role:serverSidebar?.role||'Owner'}}/><div className="nx-main"><MobileMenuButton onClick={()=>setMobileOpen(true)}/><main id="main-content" className="nx-main-content">{location.pathname==='/'?<Card><PageHeading eyebrow={t('home.eyebrow')} title={t('home.title')} description={t('home.description')}/><div className="nx-welcome-grid">{modules.filter(m=>m.id!=='overview').map(m=><button key={m.id} className="nx-welcome-card" onClick={()=>navigate(m.defaultRoute)}><span>{m.icon}</span><strong>{m.id==='onsite-operations'?t('nav.onsite'):m.id==='events'?translateEvents(m.name):m.name}</strong><small>{m.id==='onsite-operations'?t('nav.onsiteDescription'):m.id==='events'?translateEvents(m.description):m.description}</small></button>)}</div></Card>:<ModuleRoute modules={modules} context={context} onBack={()=>navigate('/')}/>}</main></div></div>
}
function ModuleRoute({modules,context,onBack}:{modules:MicrofrontendManifest[];context:ModuleContext;onBack:()=>void}){const{t}=useI18n();const module=findModuleForRoute(context.route||'/',modules);if(!module){const denied=!!findModuleForRoute(context.route||'/',moduleRegistry);return <Card><EmptyState title={t(denied?'common.forbidden':'common.notFound')} description={t(denied?'common.forbiddenDescription':'common.notFoundDescription')} action={<Button variant="ghost" onClick={onBack}>{t('common.back')}</Button>}/></Card>;}const moduleContext = module.id === 'events' ? {...context, apiBaseUrl: import.meta.env.VITE_EVENTS_API_URL || ''} : context;return <ModuleLoader module={module} context={moduleContext}/>}
function ModuleLoader({module,context}:{module:MicrofrontendManifest;context:ModuleContext}){const[Component,setComponent]=useState<ComponentType<{context:ModuleContext}>|null>(null);const{t}=useI18n();useEffect(()=>{let active=true;setComponent(null);module.load().then(loaded=>{if(active)setComponent(()=>loaded)});return()=>{active=false}},[module]);return Component?<Component context={context}/>:<Card><p>{t('common.loading')}</p></Card>}
