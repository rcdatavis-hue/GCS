// Usage: node test/verify.js <baselineDir> <candidateDir>  → exits 1 on any difference
const fs=require('fs'),path=require('path');const [,,a,b]=process.argv;let bad=0;
for(const f of fs.readdirSync(a).sort()){const A=fs.readFileSync(path.join(a,f),'utf8');const B=fs.existsSync(path.join(b,f))?fs.readFileSync(path.join(b,f),'utf8'):'';
 if(A===B){console.log('PASS',f);continue;} bad++;const al=A.split('\n'),bl=B.split('\n');
 for(let i=0;i<Math.max(al.length,bl.length);i++) if(al[i]!==bl[i]){console.log('FAIL',f,'line',i+1,'\n  base:',(al[i]||'').slice(0,200),'\n  cand:',(bl[i]||'').slice(0,200));break;}}
console.log(bad?`${bad} FAILED`:'ALL PASS');process.exit(bad?1:0);
