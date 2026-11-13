const { chromium } = require('playwright'); const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+path.resolve('out/'+process.argv[2]+'.html'));await p.evaluate(()=>document.fonts.ready);
const r=await p.evaluate(()=>[...document.querySelectorAll('.page')].map((e,i)=>{const kids=[...e.children].filter(c=>!c.classList.contains('folio'));const last=kids[kids.length-1];const bottom=last?last.getBoundingClientRect().bottom-e.getBoundingClientRect().top:0;return (i+1)+':'+(bottom*25.4/96).toFixed(0)}));
console.log(r.join(' '));await b.close();})();
