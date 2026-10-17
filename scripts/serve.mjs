import {createServer} from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {root} from './inputs.mjs';
import {createLive} from './live.mjs';
const port=Number(process.env.PORT ?? '4173');if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const dist=await realpath(path.join(root,'dist'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const live=process.env.ROADMAP_LIVE_CONFIG?await createLive(process.env.ROADMAP_LIVE_CONFIG):null;
const server=createServer(async(req,res)=>{
 const host=req.headers.host,origin=req.headers.origin;
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)||origin&&!['http://'+host].includes(origin)){res.writeHead(403).end('Forbidden');return;}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
 try{
  const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
  if(pathname.startsWith('/api/live/')){
   const value=live?await live.response(pathname.slice('/api/live/'.length)):null;
   res.writeHead(value?200:404,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:JSON.stringify(value??{error:'Live source not configured'}));return;
  }
  const file=pathname==='/'?'index.html':pathname.slice(1);
  const candidate=path.resolve(dist,file);if(!candidate.startsWith(dist+path.sep))throw Error('Outside dist');
  const resolved=await realpath(candidate);if(!resolved.startsWith(dist+path.sep))throw Error('Outside dist');
  const bytes=await readFile(resolved);res.writeHead(200,{'Content-Type':types[path.extname(resolved)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');}
});
server.listen(port,'127.0.0.1',()=>process.stdout.write(`Roadmap observer: http://127.0.0.1:${port}\n`));
