import {test,expect} from '@playwright/test';

test('sin sesión inicia en login y protege el shell',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Iniciar sesión'})).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('login no genera scroll horizontal en móvil',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto('/login');
  await expect(page.getByRole('heading',{name:'Iniciar sesión'})).toBeVisible();
  const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
  expect(fits).toBeTruthy();
});

test('con sesión navega al microfrontend Onsite',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('nexo.session',JSON.stringify({access_token:'test',refresh_token:'test',expires_at:4102444800,profile:{id:'user-1',name:'Owner Demo',email:'owner@nexo.local'},tenants:[{id:'tenant-1',name:'IncubaUNAS',slug:'incubaunas',created_at:'2026-01-01T00:00:00Z'}]})));
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('button',{name:/Operaciones presenciales/})).toBeVisible();
  await page.getByRole('main').getByRole('button',{name:/Operaciones presenciales/}).click();
  await expect(page.getByRole('heading',{name:'Registrar asistencia',exact:true}).first()).toBeVisible();
});

test('permite cambiar el idioma de la aplicación',async({page})=>{
  await page.addInitScript(()=>{sessionStorage.setItem('nexo.session',JSON.stringify({access_token:'test',refresh_token:'test',expires_at:4102444800,profile:{id:'user-1',name:'Owner Demo',email:'owner@nexo.local'},tenants:[{id:'tenant-1',name:'IncubaUNAS',slug:'incubaunas',created_at:'2026-01-01T00:00:00Z'}]}));localStorage.setItem('nexo.locale','en')});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'All your work, connected.'})).toBeVisible();
  await expect(page.getByText('Workspace',{exact:true})).toBeVisible();
});
