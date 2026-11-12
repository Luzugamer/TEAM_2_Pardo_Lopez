import {test,expect} from '@playwright/test';

test('módulo de eventos consulta y crea datos en Configuration local',async({page})=>{
  test.skip(!process.env.EVENTS_LIVE_API,'Requiere Configuration aislada y seed de demostración.');
  await page.addInitScript(()=>sessionStorage.setItem('nexo.session',JSON.stringify({access_token:'test',refresh_token:'test',expires_at:4102444800,profile:{id:'u',name:'Owner',email:'owner@example.test'},tenants:[{id:'t',name:'Organización demo',slug:'demo',created_at:'2026-01-01T00:00:00Z'}]})));
  await page.route('**/v1/navigation/sidebar**',route=>route.fulfill({json:{items:[{id:'overview'}],role:'owner'}}));
  await page.goto('/events/events');
  await expect(page.getByText('Encuentro de innovación — demostración').first()).toBeVisible();
  await page.getByRole('button',{name:'Nuevo evento',exact:true}).click();
  const dialog=page.getByRole('dialog');
  const slug=`nexo-prueba-${Date.now()}`;
  await dialog.getByLabel('Nombre del evento').fill('Prueba integración Nexo');
  await dialog.getByLabel('Identificador (slug)').fill(slug);
  await dialog.getByLabel('ID del sitio (UUID)').fill('0194eb11-3000-7000-8000-000000000001');
  await dialog.getByLabel('Fecha de inicio').fill('2027-12-01T10:00');
  await dialog.getByLabel('Fecha de fin').fill('2027-12-02T10:00');
  const response=page.waitForResponse(r=>r.url().endsWith('/configuration/v1/events')&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:/Guardar cambios/}).click();
  expect((await response).status()).toBe(201);
  await expect(page.getByText('Prueba integración Nexo').first()).toBeVisible();
});
