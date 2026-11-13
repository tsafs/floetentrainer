const { chromium } = require('playwright'); const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+path.resolve('out/measure.html'));await p.evaluate(()=>document.fonts.ready);
const r=await p.evaluate(()=>{const o={};document.querySelectorAll('.mb').forEach(e=>{o[e.dataset.id]=e.getBoundingClientRect().height*25.4/96});return o});
console.log(JSON.stringify(r));await b.close();})();
