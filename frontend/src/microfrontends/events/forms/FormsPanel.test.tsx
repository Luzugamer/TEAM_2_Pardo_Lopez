import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {EventsTransport} from '../api';
import {FormsPanel} from './FormsPanel';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root: Root | undefined;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;document.body.innerHTML='';});
describe('forms panel',()=>{
 it('shows the editable draft and preview without publishing without capability',async()=>{
  const call=vi.fn(async()=>[]); const el=document.createElement('div');document.body.append(el);root=createRoot(el);
  await act(async()=>{root!.render(<FormsPanel transport={{request:call as EventsTransport['request']}} canWrite canPublish={false} contextKey="tenant-a"/>)});
  expect(call).toHaveBeenCalledWith('/forms'); expect(el.textContent).toContain('Crear formulario');
  expect(el.textContent).not.toContain('Validar y publicar formulario');
 });
 it('does not query form administration without write permission',async()=>{
  const call=vi.fn(async()=>[]); const el=document.createElement('div');document.body.append(el);root=createRoot(el);
  await act(async()=>{root!.render(<FormsPanel transport={{request:call as EventsTransport['request']}} canWrite={false} canPublish={false} contextKey="tenant-a"/>)});
  expect(call).not.toHaveBeenCalled(); expect(el.textContent).toContain('Sin acceso de escritura');
 });
});
