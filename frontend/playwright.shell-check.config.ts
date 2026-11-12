import {defineConfig} from '@playwright/test';
import {env} from 'node:process';
export default defineConfig({testDir:'./e2e',testMatch:['shell.spec.ts','events-forbidden.spec.ts'],use:{baseURL:'http://127.0.0.1:5176',...(env.EVENTS_BROWSER_CHANNEL?{channel:env.EVENTS_BROWSER_CHANNEL}:{})},webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5176',url:'http://127.0.0.1:5176',reuseExistingServer:false,env:{VITE_EVENTS_DEMO:'false'}}});
