import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {EventsModule} from './EventsModule';
import type {EventsTransport} from './api';
import type {ModuleContext} from '../../platform/microfrontends/contracts';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;document.body.innerHTML='';});
describe('injected Configuration transport',()=>{
 it('uses an injected transport without an actor argument and hides publication commands without permission',async()=>{
  const call=vi.fn(async(path:string)=>path.startsWith('/events?')?{items:[{id:'e1',title:'Prueba',slug:'prueba',status:'draft',revision_number:1,starts_at:'2027-01-01T00:00:00Z',ends_at:'2027-01-02T00:00:00Z',timezone:'UTC',kind:'conference',site_id:'s'}],page_info:{next_cursor:null}}:{items:[],next_cursor:null});
  const transport:EventsTransport={request:call as EventsTransport['request']};
  const context:ModuleContext={version:1,tenantId:'org',workspaceId:'w',capabilities:['events:read','events:write'],apiBaseUrl:'',theme:'light',route:'/events/events'};
  const container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await act(async()=>{root!.render(<EventsModule context={context} transport={transport}/>);});
  expect(call).toHaveBeenCalled();expect(call.mock.calls[0][0]).toContain('/events?');
  const row=container.querySelector<HTMLButtonElement>('.event-row');expect(row).not.toBeNull();
  await act(async()=>{row!.click()});
  expect(container.textContent).toContain('Editar evento');
  const labels = Array.from(container.querySelectorAll('button')).map(button => button.textContent?.trim());
  expect(labels).not.toContain('Cerrar');
  expect(labels).not.toContain('Cancelar');
 });
});
