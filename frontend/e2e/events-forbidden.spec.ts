import {test,expect} from '@playwright/test';

test('una ruta directa de eventos sin capability no monta el módulo',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('nexo.session',JSON.stringify({access_token:'test',refresh_token:'test',expires_at:4102444800,profile:{id:'u',name:'Owner',email:'owner@example.test'},tenants:[{id:'t',name:'Demo',slug:'demo',created_at:'2026-01-01T00:00:00Z'}]})));
 await page.route('**/v1/navigation/sidebar**',route=>route.fulfill({json:{items:[{id:'overview'},{id:'events'}],role:'owner'}}));
 await page.goto('/events/agenda');
 await expect(page.getByRole('heading',{name:'Sin permisos'})).toBeVisible();
 await expect(page.locator('.events-module')).toHaveCount(0);
});
