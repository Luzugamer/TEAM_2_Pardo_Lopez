import {expect,test} from '@playwright/test';

const session={access_token:'test',refresh_token:'test',expires_at:4102444800,profile:{id:'00000000-0000-0000-0000-000000000004',name:'Staff Demo',email:'staff@nexo.local'},tenants:[{id:'00000000-0000-0000-0000-000000000001',name:'IncubaUNAS',slug:'incubaunas',created_at:'2026-01-01T00:00:00Z'}]};

test.beforeEach(async({page})=>{
  await page.addInitScript(value=>sessionStorage.setItem('nexo.session',JSON.stringify(value)),session);
  await page.goto('/onsite');
  await page.getByRole('button',{name:/Operaciones presenciales/}).click();
});

test('busca manualmente y registra un ticket persistente',async({page})=>{
  await page.getByLabel('Código QR o ticket').fill('DEMO-2026-002');
  await page.getByRole('button',{name:'Buscar ticket'}).click();
  await expect(page.getByText('B*** Demo')).toBeVisible();
  await page.getByRole('button',{name:'Registrar entrada'}).click();
  await expect(page.getByText('Entrada registrada para Participante demo')).toBeVisible();
  await expect(page.locator('.nx-status-line').filter({hasText:'Presentes'})).toContainText('2');
  await page.reload();
  await expect(page.locator('.nx-status-line').filter({hasText:'Presentes'})).toContainText('2');
});

test('procesa un QR y muestra el duplicado proveniente del API',async({page})=>{
  await page.getByLabel('Código QR o ticket').fill('nexo:ticket:DEMO-2026-003');
  await page.getByRole('button',{name:'Simular escaneo'}).click();
  await expect(page.getByText('C*** Demo')).toBeVisible();
  await page.getByRole('button',{name:'Registrar entrada'}).click();
  await expect(page.getByText(/already_present/)).toBeVisible();
});
