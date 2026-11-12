import {spawn,spawnSync} from 'node:child_process';

const cwd=new URL('../../microservices/onsite-operations/',import.meta.url);
const directory=cwd.pathname;
spawnSync('docker',['compose','down','-v'],{cwd:directory,stdio:'inherit'});
const compose=spawn('docker',['compose','up','-d','--build'],{cwd:directory,stdio:'inherit'});
const exitCode=await new Promise(resolve=>compose.on('exit',code=>resolve(code??1)));
if(exitCode!==0)process.exit(exitCode);
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;spawnSync('docker',['compose','down'],{cwd:directory,stdio:'inherit'});process.exit(0)};
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('exit',()=>{if(!stopping)spawnSync('docker',['compose','down'],{cwd:directory,stdio:'inherit'})});
setInterval(()=>{},60_000);
