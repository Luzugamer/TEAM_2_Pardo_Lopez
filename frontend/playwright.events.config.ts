import {defineConfig} from '@playwright/test';
import {env} from 'node:process';
export default defineConfig({testDir:'./e2e',testMatch:['events-module.spec.ts','events-live.spec.ts','events-forms.spec.ts'],use:{baseURL:'http://127.0.0.1:5175',...(env.EVENTS_BROWSER_CHANNEL?{channel:env.EVENTS_BROWSER_CHANNEL}:{})},webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5175',url:'http://127.0.0.1:5175',reuseExistingServer:false,env:{VITE_EVENTS_DEMO:'true',VITE_EVENTS_API_URL:env.EVENTS_LIVE_API||''}}});
