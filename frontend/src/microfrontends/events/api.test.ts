import {afterEach,describe,expect,it,vi} from 'vitest';
import {createEventsTransport} from './api';

afterEach(()=>vi.unstubAllGlobals());
describe('Configuration transport boundary',()=>{
  it('fails closed if no authenticated transport exists',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const transport=createEventsTransport({baseUrl:'',mode:'unavailable',development:false,actor:'org-a-manager'});
    await expect(transport.request('/events')).rejects.toThrow('pendiente');expect(fetch).not.toHaveBeenCalled();
  });
  it('does not allow the development transport outside development',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const transport=createEventsTransport({baseUrl:'',mode:'demo',development:false,actor:'org-a-manager'});
    await expect(transport.request('/events')).rejects.toThrow('pendiente');expect(fetch).not.toHaveBeenCalled();
  });
  it('sends development actor and revision only in explicit demo mode',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,text:async()=>' {"id":"1"}'});vi.stubGlobal('fetch',fetch);
    const transport=createEventsTransport({baseUrl:'http://localhost:3000/',mode:'demo',development:true,actor:'org-a-manager'});
    const result=await transport.request('/events/1',{method:'PATCH',body:{title:'Test'},revision:3});
    expect(result.id).toBe('1');expect(fetch).toHaveBeenCalledWith('http://localhost:3000/configuration/v1/events/1',expect.objectContaining({method:'PATCH',headers:expect.objectContaining({'x-dev-actor':'org-a-manager','If-Match':'"3"'})}));
  });
  it('sets an idempotency key on commands and propagates problem details',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:false,status:409,text:async()=>' {"detail":"Conflicto"}'});vi.stubGlobal('fetch',fetch);
    const transport=createEventsTransport({baseUrl:'',mode:'demo',development:true,actor:'org-a-manager'});
    await expect(transport.request('/events',{method:'POST',body:{}})).rejects.toThrow('Conflicto');
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBeTruthy();
  });
  it('sends Nexo bearer token and tenant id in authenticated mode without dev actor',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,text:async()=>' {"items":[]}'});vi.stubGlobal('fetch',fetch);
    const transport=createEventsTransport({baseUrl:'http://localhost:3000',mode:'authenticated',development:false,accessToken:'jwt-token',tenantId:'tenant-uuid'});
    await transport.request('/events');
    const headers=fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer jwt-token');
    expect(headers['X-Tenant-Id']).toBe('tenant-uuid');
    expect(headers['x-dev-actor']).toBeUndefined();
  });
  it('fails closed in authenticated mode when token or tenant is missing',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const transport=createEventsTransport({baseUrl:'http://localhost:3000',mode:'authenticated',development:true,accessToken:'',tenantId:'tenant-uuid'});
    await expect(transport.request('/events')).rejects.toThrow('pendiente');
    expect(fetch).not.toHaveBeenCalled();
  });
});
