// Builds dist/index.html from src/. Usage: node build.js
const fs=require('fs'),path=require('path');
const src=path.join(__dirname,'src');
const cat=dir=>JSON.parse(fs.readFileSync(path.join(src,dir,'_order.json'),'utf8'))
  .map(f=>fs.readFileSync(path.join(src,dir,f),'utf8')).join('');
let html=fs.readFileSync(path.join(src,'shell.html'),'utf8');
html=html.replace('@@ENGINE@@',()=>cat('engine')).replace('@@UI@@',()=>cat('ui-components'));
fs.mkdirSync(path.join(__dirname,'dist'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'dist','index.html'),html);
const m=html.match(/PCW_BUILD = '([^']+)'/);console.log('built dist/index.html',html.length,'chars, PCW_BUILD',m&&m[1]);
