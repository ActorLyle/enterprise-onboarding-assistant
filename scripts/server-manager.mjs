import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(root,'.runtime');
const pidFile=path.join(runtime,'server.pid');
const logFile=path.join(runtime,'server.log');
const port=Number(process.env.PORT||3000);
const healthUrls=[`http://127.0.0.1:${port}/api/health`,`http://[::1]:${port}/api/health`];

async function probe(url){try{const r=await fetch(url,{signal:AbortSignal.timeout(1200)});if(!r.ok)return null;const j=await r.json();return j.service==='onboarding-plan-skill-platform'?j:null;}catch{return null;}}
async function healthy(){for(const url of healthUrls){const result=await probe(url);if(result)return result;}return null;}
async function delay(ms){return new Promise(r=>setTimeout(r,ms));}
async function savedSupervisorPid(){try{return Number(await readFile(pidFile,'utf8'));}catch{return 0;}}
function alive(pid){if(!pid)return false;try{process.kill(pid,0);return true;}catch{return false;}}
async function terminate(h){const pid=h?.supervisor_pid||h?.pid||await savedSupervisorPid();if(!pid)return;try{process.kill(pid,'SIGTERM');}catch{}}

const command=process.argv[2]||'status';
if(command==='status'){
 const h=await healthy();
 if(h){console.log(`RUNNING http://localhost:${port} (PID ${h.pid})`);process.exit(0);}
 console.log(`STOPPED: no onboarding app answered on port ${port}`);process.exit(1);
}
if(command==='start'||command==='restart'){
 let h=await healthy();
 if(h&&command==='start'&&h.supervisor_pid){console.log(`Already running at http://localhost:${port} (PID ${h.pid})`);process.exit(0);}
 if(command==='restart'||(h&&command==='start'&&!h.supervisor_pid)){
  await terminate(h);
  for(let i=0;i<40;i++){if(!await healthy())break;await delay(250);}
 }else if(!h&&alive(await savedSupervisorPid())){
  for(let i=0;i<60;i++){h=await healthy();if(h){console.log(`RUNNING http://localhost:${port} (PID ${h.pid})`);process.exit(0);}await delay(250);}
  console.error(`Supervisor exists but the app is not healthy. Check ${logFile}.`);process.exit(1);
 }
 await mkdir(runtime,{recursive:true});
 const child=spawn(process.execPath,['scripts/server-supervisor.mjs'],{cwd:root,env:process.env,detached:true,windowsHide:true,stdio:'ignore'});
 child.unref();
 await writeFile(pidFile,String(child.pid),'utf8');
 for(let i=0;i<40;i++){
  h=await healthy();
  if(h){console.log(`RUNNING http://localhost:${port} (PID ${h.pid})`);process.exit(0);}
  await delay(250);
 }
 let detail='';try{detail=await readFile(logFile,'utf8');}catch{}
 console.error(`Server did not become healthy on port ${port}. Check port conflicts or Node.js. ${detail.slice(-1500)}`);
 process.exit(1);
}
if(command==='stop'){
 const h=await healthy();
 const pid=h?.supervisor_pid||h?.pid||await savedSupervisorPid();
 if(!pid||!alive(pid)){console.log('Already stopped');process.exit(0);}
 await terminate(h);
 for(let i=0;i<40;i++){if(!alive(pid)){console.log(`STOPPED PID ${pid}`);process.exit(0);}await delay(250);}
 console.error(`PID ${h.pid} did not stop`);process.exit(1);
}
console.error('Usage: node scripts/server-manager.mjs [start|status|restart|stop]');process.exit(2);
