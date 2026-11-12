import type {ComponentType,ReactNode} from 'react';
export type Capability='onsite:read'|'onsite:checkin'|'onsite:manage'|'reports:read'|'platform:admin'|`${string}:${string}`;
export type ModuleContext={version:1;tenantId:string;workspaceId:string;capabilities:Capability[];apiBaseUrl:string;theme:'light'|'dark';route?:string};
export type ModuleChild={id:string;label:string;description:string;route:string;icon:ReactNode};
export type MicrofrontendManifest={id:string;name:string;description:string;group:string;defaultRoute:string;routes:string[];capabilities:Capability[];icon:ReactNode;children?:ModuleChild[];load:()=>Promise<ComponentType<{context:ModuleContext}>>};
export function canMount(module:MicrofrontendManifest,capabilities:Capability[]){return module.capabilities.length===0||module.capabilities.some(capability=>capabilities.includes(capability));}
