import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { root, read, write } from './store.js';
import { execute, testSkill, runTool } from './engine.js';
import { getCozeToken, loadEnvFile } from './env.js';

await loadEnvFile();

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
async function body(req){let s='';for await(const c of req)s+=c;return s?JSON.parse(s):{};}
function send(res,status,data,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(data):data);}
const handler=async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const method=req.method;
 if(method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,service:'onboarding-plan-skill-platform',port:Number(process.env.PORT||3000),pid:process.pid,supervisor_pid:process.env.SUPERVISOR_PID?Number(process.env.SUPERVISOR_PID):null});
 if(method==='GET'&&url.pathname==='/api/bootstrap'){const [employees,skills,tools]=await Promise.all([read('employees'),read('skills'),read('tools')]);return send(res,200,{employees,skills,tools,mode:process.env.OPENAI_API_KEY?'api':'mock',coze:{configured:Boolean(getCozeToken()),workflow_id:process.env.COZE_WORKFLOW_ID||'7661245829961302052'}});}
 if(method==='POST'&&url.pathname==='/api/execute'){const b=await body(req);return send(res,200,await execute(b));}
 if(method==='GET'&&url.pathname==='/api/skills')return send(res,200,await read('skills'));
 if(method==='GET'&&url.pathname.startsWith('/api/skills/')){const s=(await read('skills')).find(x=>x.id===url.pathname.split('/')[3]);return s?send(res,200,s):send(res,404,{error:'Skill 不存在'});}
 if(method==='PUT'&&url.pathname.startsWith('/api/skills/')){const id=url.pathname.split('/')[3],b=await body(req),all=await read('skills'),i=all.findIndex(x=>x.id===id);if(i<0)return send(res,404,{error:'Skill 不存在'});all[i]={...all[i],...b,id};await write('skills',all);return send(res,200,all[i]);}
 if(method==='POST'&&url.pathname.startsWith('/api/skills/')&&url.pathname.endsWith('/test')){const id=url.pathname.split('/')[3];return send(res,200,await testSkill(id,await body(req)));}
 if(method==='GET'&&url.pathname==='/api/logs')return send(res,200,await read('execution_logs'));
 if(method==='DELETE'&&url.pathname.startsWith('/api/logs/')){const id=decodeURIComponent(url.pathname.slice('/api/logs/'.length)),all=await read('execution_logs'),index=all.findIndex(log=>log.id===id);if(index<0)return send(res,404,{error:'执行日志不存在'});all.splice(index,1);await write('execution_logs',all);return send(res,200,{ok:true,deleted_id:id});}
 if(method==='GET'&&url.pathname==='/api/logs/summary')return send(res,200,{count:(await read('execution_logs')).length});
 if(method==='GET'&&url.pathname==='/api/tools'){const tools=await read('tools');return send(res,200,tools.map(tool=>({...tool,credential_configured:Boolean(getCozeToken(tool.token_env_var))})));}
 if(method==='GET'&&url.pathname.startsWith('/api/tools/')){const id=url.pathname.split('/')[3],tool=(await read('tools')).find(x=>x.id===id);if(!tool)return send(res,404,{error:'Tool 不存在'});return send(res,200,{...tool,credential_configured:Boolean(getCozeToken(tool.token_env_var))});}
 if(method==='PUT'&&url.pathname.startsWith('/api/tools/')){const id=url.pathname.split('/')[3],patch=await body(req),all=await read('tools'),i=all.findIndex(x=>x.id===id);if(i<0)return send(res,404,{error:'Tool 不存在'});if(patch.id!==undefined||patch.source!==undefined)return send(res,400,{error:'Tool ID 与数据源不能通过管理页修改'});if(patch.enabled!==undefined&&typeof patch.enabled!=='boolean')return send(res,400,{error:'enabled 必须为 Boolean'});for(const key of ['name','description','workflow_id','base_url','token_env_var'])if(patch[key]!==undefined&&typeof patch[key]!=='string')return send(res,400,{error:`${key} 必须为 String`});if(patch.name!==undefined&&!patch.name.trim())return send(res,400,{error:'Tool 名称不能为空'});if(patch.workflow_id!==undefined&&!/^\d+$/.test(patch.workflow_id))return send(res,400,{error:'Workflow ID 必须是数字字符串'});if(patch.base_url!==undefined&&!/^https?:\/\//i.test(patch.base_url))return send(res,400,{error:'Base URL 必须以 http:// 或 https:// 开头'});if(patch.token_env_var!==undefined&&patch.token_env_var&&!/^[A-Za-z_][A-Za-z0-9_]*$|^\d+$/.test(patch.token_env_var))return send(res,400,{error:'环境变量名称格式不正确'});all[i]={...all[i],...patch,id};await write('tools',all);return send(res,200,{...all[i],credential_configured:Boolean(getCozeToken(all[i].token_env_var))});}
 if(method==='POST'&&url.pathname.startsWith('/api/tools/')){const id=url.pathname.split('/')[3];return send(res,200,await runTool(id,await body(req)));}
 if(method==='GET'&&url.pathname.startsWith('/api/data/')){const name=url.pathname.split('/')[3].replace(/\.json$/,'');if(!['employees','onboarding_tasks','contacts','policies','trainings','tools'].includes(name))return send(res,404,{error:'Not found'});return send(res,200,await read(name));}
 const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);const target=path.resolve(root,'public',`.${pathname}`);if(!target.startsWith(path.resolve(root,'public')))return send(res,403,{error:'Forbidden'});const data=await fs.readFile(target);return send(res,200,data,mime[path.extname(target)]||'application/octet-stream');
 }catch(e){return send(res,e.statusCode||400,{error:e.message||'请求失败'});}};
const port=Number(process.env.PORT||3000);
// Bind both loopback address families explicitly. Depending on host DNS order,
// localhost can resolve to either ::1 or 127.0.0.1.
const listeners=[];
for(const options of [{host:'127.0.0.1'},{host:'::1',ipv6Only:true}]){
 const server=http.createServer(handler);
 server.on('error',error=>{
  const optionalIpv6Error=options.host==='::1'&&['EAFNOSUPPORT','EPROTONOSUPPORT','EADDRNOTAVAIL'].includes(error.code);
  console.error(`Could not bind ${options.host}:${port}: ${error.message}`);
  if(!optionalIpv6Error)process.exit(1);
 });
 server.listen({port,...options},()=>{listeners.push(server);console.log(`Onboarding Plan + Skill platform: http://${options.host.includes(':')?'[::1]':'127.0.0.1'}:${port}`);});
}
