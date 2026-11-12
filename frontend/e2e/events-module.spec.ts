import {test,expect} from '@playwright/test';

const TENANT_A = '0194eb00-0000-7000-8000-000000000001';
const TENANT_B = '0194eb00-0000-7000-8000-000000000002';

test.beforeEach(async ({page})=>{
  await page.addInitScript(({tenantA,tenantB})=>sessionStorage.setItem('nexo.session',JSON.stringify({access_token:'nexo-jwt-test',refresh_token:'test',expires_at:4102444800,profile:{id:'0194eb00-0000-7000-9000-000000000001',name:'Owner',email:'owner@example.test'},tenants:[{id:tenantA,name:'Organización A',slug:'org-a',created_at:'2026-01-01T00:00:00Z'},{id:tenantB,name:'Organización B',slug:'org-b',created_at:'2026-01-01T00:00:00Z'}]})),{tenantA:TENANT_A,tenantB:TENANT_B});
  await page.route('**/v1/navigation/sidebar**',route=>route.fulfill({json:{items:[{id:'overview',capabilities:[]},{id:'onsite-operations',capabilities:['onsite:read']},{id:'events',capabilities:['events:read','events:write','events:publish']}],role:'owner'}}));
  await page.route('**/configuration/v1/**',async route=>{
    const request=route.request();const url=new URL(request.url());
    if(url.pathname.endsWith('/events')&&request.method()==='POST')return route.fulfill({status:201,json:{id:'e1'}});
    if(url.pathname.endsWith('/events'))return route.fulfill({json:{items:[{id:'e1',title:'Encuentro de prueba',slug:'demo',status:'draft',revision_number:1,starts_at:'2026-12-01T10:00:00Z',ends_at:'2026-12-02T10:00:00Z',timezone:'America/Lima',kind:'conference',site_id:'0194eb10-0000-7000-8000-000000000001'}],page_info:{next_cursor:null}}});
    return route.fulfill({json:{items:[],next_cursor:null}});
  });
});

test('events mounts in the Nexo shell, navigates and creates an event',async({page})=>{
  await page.goto('/events/events');
  await expect(page.getByRole('heading',{name:'Eventos',exact:true})).toBeVisible();
  await expect(page.getByText('Encuentro de prueba').first()).toBeVisible();
  await expect(page.getByLabel('Actor de desarrollo')).toHaveCount(0);
  await expect(page.getByText('Demostración local:')).toHaveCount(0);
  if (process.env.EVENTS_SCREENSHOT) await page.screenshot({path:'test-results/events-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Nuevo evento',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Nombre del evento').fill('Nuevo evento');
  await dialog.getByLabel('Identificador (slug)').fill('nuevo');
  await dialog.getByLabel('ID del sitio (UUID)').fill('0194eb10-0000-7000-8000-000000000001');
  await dialog.getByLabel('Fecha de inicio').fill('2026-12-01T10:00');
  await dialog.getByLabel('Fecha de fin').fill('2026-12-02T10:00');
  const created=page.waitForRequest(r=>r.url().endsWith('/configuration/v1/events')&&r.method()==='POST');
  await dialog.getByRole('button',{name:/Guardar cambios/}).click();
  const request=await created;
  expect(request.headers()['authorization']).toBe('Bearer nexo-jwt-test');
  expect(request.headers()['x-tenant-id']).toBe(TENANT_A);
  expect(request.headers()['x-dev-actor']).toBeUndefined();
  expect(request.headers()['idempotency-key']).toBeTruthy();
  await expect(dialog).not.toBeVisible();
  await page.goto('/events/agenda');await expect(page.getByRole('heading',{name:'Agenda y programas'})).toBeVisible();
  await page.goto('/onsite');await expect(page.getByRole('heading',{name:'Registrar asistencia',exact:true}).first()).toBeVisible();
});

test('events layout fits a mobile viewport',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.goto('/events/events');
  await expect(page.getByRole('heading',{name:'Eventos',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  if (process.env.EVENTS_SCREENSHOT) await page.screenshot({path:'test-results/events-mobile.png',fullPage:true});
});

test('events follows the shell language',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('nexo.locale','en'));
  await page.goto('/events/events');
  await expect(page.getByRole('heading',{name:'Events',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'New event',exact:true})).toBeVisible();
});

test('switching Nexo organizations does not show an older tenant response',async({page})=>{
  let releaseFirst!:()=>void;let firstStarted!:()=>void;
  const firstWaiting=new Promise<void>(resolve=>{releaseFirst=resolve});
  const firstRequest=new Promise<void>(resolve=>{firstStarted=resolve});
  await page.route('**/configuration/v1/events?**',async route=>{
    const tenantId=route.request().headers()['x-tenant-id'];
    if(tenantId===TENANT_A){firstStarted();await firstWaiting;return route.fulfill({json:{items:[{id:'a',title:'Evento antiguo A',slug:'a',status:'draft'}],page_info:{next_cursor:null}}});}
    return route.fulfill({json:{items:[{id:'b',title:'Evento actual B',slug:'b',status:'draft'}],page_info:{next_cursor:null}}});
  });
  await page.goto('/events/events');await firstRequest;
  await page.getByRole('button',{name:'Organización A'}).click();
  await page.getByRole('button',{name:/Organización B/}).click();
  await expect(page.getByText('Evento actual B')).toBeVisible();releaseFirst();
  await expect(page.getByText('Evento antiguo A')).toHaveCount(0);
});

test('the event form handles keyboard focus and escape',async({page})=>{
  await page.goto('/events/events');
  const trigger=page.getByRole('button',{name:'Nuevo evento',exact:true});await trigger.click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Cerrar')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button',{name:/Guardar cambios/})).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
});

test('event styles follow Nexo dark theme tokens',async({page})=>{
  await page.goto('/events/events');await expect(page.getByRole('heading',{name:'Eventos',exact:true})).toBeVisible();
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark'});
  const matches=await page.locator('.events-module .panel').first().evaluate(el=>getComputedStyle(el).backgroundColor===getComputedStyle(document.documentElement).getPropertyValue('--nx-color-surface').trim()||getComputedStyle(el).backgroundColor==='rgb(23, 30, 56)');
  expect(matches).toBeTruthy();
});

test('a read-only Nexo member cannot see event edit actions',async({page})=>{
 await page.route('**/v1/navigation/sidebar**',route=>route.fulfill({json:{items:[{id:'overview',capabilities:[]},{id:'events',capabilities:['events:read']}],role:'member'}}));
 await page.goto('/events/events');
 await page.getByRole('button',{name:/Encuentro de prueba/}).click();
 await expect(page.getByRole('button',{name:'Editar evento'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Nuevo evento'})).toHaveCount(0);
});
