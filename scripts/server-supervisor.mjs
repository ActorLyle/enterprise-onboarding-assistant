import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const logFile=path.join(root,'.runtime','server.log');
const pidFile=path.join(root,'.runtime','server.pid');
let child=null,stopping=false,restarts=0,timer=null;
async function log(line){try{await appendFile(logFile,`${new Date().toISOString()} ${line}\n`,'utf8');}catch{}}
async function cleanPid(){try{const pid=Number(await readFile(pidFile,'utf8'));if(pid===process.pid)await unlink(pidFile);}catch{}}
function shutdown(){stopping=true;if(timer)clearTimeout(timer);if(child){const current=child;child=null;current.kill('SIGTERM');setTimeout(()=>{void cleanPid();process.exit(0);},2500).unref();}else{void cleanPid();process.exit(0);}}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
function launch(){
 if(stopping)return;
 const logFd=openSync(logFile,'a');
 child=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,SUPERVISOR_PID:String(process.pid)},windowsHide:true,stdio:['ignore',logFd,logFd]});
 closeSync(logFd);
 const current=child;
 current.on('error',error=>log(`server launch error: ${error.message}`));
 current.on('exit',(code,signal)=>{
  if(child===current)child=null;
  if(stopping)return;
  restarts++;
  const delay=Math.min(30000,1000*Math.min(restarts,30));
  void log(`server exited code=${code} signal=${signal}; restart ${restarts} in ${delay}ms`);
  timer=setTimeout(launch,delay);
 });
}
await mkdir(path.dirname(pidFile),{recursive:true});
await writeFile(pidFile,String(process.pid),'utf8');
void log(`supervisor started pid=${process.pid}`);launch();
