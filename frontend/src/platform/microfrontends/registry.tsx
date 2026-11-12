import {BarChart3,CalendarCheck2,CalendarDays,ClipboardCheck,LayoutDashboard,ListChecks,MapPin,Users,FileCheck2,Activity,Layers3} from 'lucide-react';
import type {MicrofrontendManifest} from './contracts';
import {canMount} from './contracts';
import {OnsiteModule} from '../../microfrontends/onsite-operations/OnsiteModule';
export const moduleRegistry:MicrofrontendManifest[]=[
  {id:'overview',name:'Inicio',description:'Contexto de tu organización',group:'Plataforma',defaultRoute:'/',routes:['/'],capabilities:[],icon:<LayoutDashboard size={17}/>,load:async()=>()=>null},
  {id:'events',name:'Eventos',description:'Configuración de eventos',group:'Gestión',defaultRoute:'/events',routes:['/events','/events/events','/events/agenda','/events/venues','/events/speakers','/events/forms','/events/publication','/events/activity'],capabilities:['events:read'],icon:<CalendarDays size={17}/>,children:[{id:'events-overview',label:'Resumen',description:'Vista general',route:'/events',icon:<Layers3 size={16}/>},{id:'events-list',label:'Eventos',description:'Administrar eventos',route:'/events/events',icon:<CalendarDays size={16}/>},{id:'events-agenda',label:'Agenda',description:'Programas y sesiones',route:'/events/agenda',icon:<ClipboardCheck size={16}/>},{id:'events-venues',label:'Sedes',description:'Espacios y salas',route:'/events/venues',icon:<MapPin size={16}/>},{id:'events-speakers',label:'Ponentes',description:'Directorio',route:'/events/speakers',icon:<Users size={16}/>},{id:'events-forms',label:'Formularios',description:'Formularios y vínculos',route:'/events/forms',icon:<ClipboardCheck size={16}/>},{id:'events-publication',label:'Publicación',description:'Versiones',route:'/events/publication',icon:<FileCheck2 size={16}/>},{id:'events-activity',label:'Actividad',description:'Historial',route:'/events/activity',icon:<Activity size={16}/>}],load:async()=> (await import('../../microfrontends/events/EventsModule')).EventsModule},
  {id:'onsite-operations',name:'Onsite Operations',description:'Check-in y operación presencial',group:'Operaciones',defaultRoute:'/onsite',routes:['/onsite','/onsite/attendance','/onsite/reports'],capabilities:['onsite:read'],icon:<CalendarCheck2 size={17}/>,children:[{id:'onsite-checkin',label:'Control de acceso',description:'Registro de entradas',route:'/onsite',icon:<ClipboardCheck size={16}/>},{id:'onsite-attendance',label:'Asistencia',description:'Seguimiento de participantes',route:'/onsite/attendance',icon:<ListChecks size={16}/>},{id:'onsite-reports',label:'Reportes',description:'Resultados y HukID',route:'/onsite/reports',icon:<BarChart3 size={16}/>}],load:async()=>OnsiteModule},
];
export function visibleModules(capabilities:MicrofrontendManifest['capabilities'][number][],registry=moduleRegistry){return registry.filter(module=>canMount(module,capabilities));}
export function findModuleForRoute(path:string,registry=moduleRegistry){return registry.find(module=>module.routes.some(route=>route===path||(route!=='/'&&path.startsWith(`${route}/`))));}
export function validateRegistry(registry=moduleRegistry){
 const errors:string[]=[];const ids=new Set<string>();const routes=new Map<string,string>();
 for(const module of registry){
  if(ids.has(module.id))errors.push(`module id duplicado: ${module.id}`);ids.add(module.id);
  if(!module.routes.includes(module.defaultRoute))errors.push(`defaultRoute no declarado: ${module.id}`);
  for(const route of module.routes){
   if(!route.startsWith('/'))errors.push(`ruta inválida: ${module.id}:${route}`);
   const owner=routes.get(route);if(owner)errors.push(`ruta duplicada: ${route} (${owner}, ${module.id})`);routes.set(route,module.id);
  }
  for(const child of module.children||[]){if(child.route!==module.defaultRoute&&!child.route.startsWith(`${module.defaultRoute}/`))errors.push(`ruta hija fuera del namespace: ${module.id}:${child.route}`);}
 }
 return errors;
}
