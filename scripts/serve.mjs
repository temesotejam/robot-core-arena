import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(import.meta.dirname,'..'),port=Number(process.env.PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{let url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(url.startsWith('/robot-core-arena/'))url=url.slice(17);const file=resolve(root,'.'+(url.endsWith('/')?url+'index.html':url));if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}const s=await stat(file);if(!s.isFile())throw Error();const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'0.0.0.0',()=>console.log(`http://localhost:${port}`));
