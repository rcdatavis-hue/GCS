// Usage: node test/shot.js <html> <fixture.json|-> <tabIndex> <out.png> [width] [jsBeforeShot]
const fs=require('fs');const {launch,openApp}=require('./harness');
const [,,html,fx,tab,out,w,js]=process.argv;
(async()=>{const b=await launch();const st=fx==='-'?'':fs.readFileSync(fx,'utf8');
 const {page,errors}=await openApp(b,html,st,{width:+w||1700,height:1000});
 await page.click(`.pcw-nav .pcw-tab >> nth=${tab}`);await page.waitForTimeout(600);
 if(js){await page.evaluate(js);await page.waitForTimeout(400);}
 await page.screenshot({path:out,fullPage:false});console.log(JSON.stringify(errors.filter(e=>!/sw\.js|ServiceWorker|manifest|404/.test(e)).slice(0,5)));await b.close();})();
