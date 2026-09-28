import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('dist'), evidence = resolve('qa/evidence');
await mkdir(evidence, {recursive:true});
const mime = {'.js':'application/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.webp':'image/webp','.ttf':'font/ttf','.bin':'application/octet-stream'};
const server = createServer(async(req,res)=>{
 try {const url=new URL(req.url,'http://localhost');const rel=decodeURIComponent(url.pathname).replace(/^\/world\//,'')||'index.html';const file=resolve(root,rel);if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}const data=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:process.platform === 'darwin' ? ['--use-angle=metal','--enable-gpu'] : ['--enable-gpu']});
const context=await browser.newContext({viewport:{width:960,height:600}});
const page=await context.newPage(); const errors=[],logs=[],requests=[]; const start=Date.now();
const log=(kind,text)=>{const row={at:(Date.now()-start)/1000,kind,text};logs.push(row);console.log(JSON.stringify(row));};
page.on('pageerror',e=>{errors.push(e.message);log('error',e.stack)});
page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());log('error',m.text())}else if(/city|warmup|player|physics|input|world|error|failed|profile/i.test(m.text()))log(m.type(),m.text());});
page.on('response',r=>{if(r.status()>=400){requests.push({url:r.url(),status:r.status()});log('http',`${r.status()} ${r.url()}`)}});
page.on('requestfailed',r=>log('network',`${r.url()} ${r.failure()?.errorText}`));
try{
 const url=`http://127.0.0.1:${server.address().port}/world/index.html?q=low&profile`;
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__ctx?.framesDrawn >= 4 && (!document.querySelector('#boot') || document.querySelector('#boot').classList.contains('out')),{},{timeout:420000});
 log('ready',JSON.stringify(await page.evaluate(()=>({pos:__ctx.player.body.position,conflicts:__ctx.input.router.conflicts(),physics:__ctx.player.physics.stats}))));
 await page.screenshot({path:resolve(evidence,'desktop.png')});
 const before=await page.evaluate(()=>({...__ctx.player.body.position}));
 await page.keyboard.down('KeyW');
 const startFrame=await page.evaluate(()=>__ctx.framesDrawn);
 await page.waitForFunction(n=>__ctx.framesDrawn>=n+25,startFrame,{timeout:60000});
 log('input',JSON.stringify(await page.evaluate(()=>({input:__ctx.input.state,velocity:__ctx.player.velocity,mode:__ctx.player.mode,contexts:__ctx.input.router.activeContexts()}))));
 await page.keyboard.up('KeyW');
 const after=await page.evaluate(()=>({...__ctx.player.body.position}));log('move',JSON.stringify({before,after}));
 await writeFile(resolve(evidence,'browser-local.json'),JSON.stringify({errors,logs,requests,before,after},null,2));
}catch(e){log('failed',e.stack);await page.screenshot({path:resolve(evidence,'failed.png'),timeout:15000}).catch(()=>{});await writeFile(resolve(evidence,'browser-local.json'),JSON.stringify({errors,logs,requests},null,2));process.exitCode=1}
finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
