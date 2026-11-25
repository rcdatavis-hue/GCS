// GCS: assembly header row for V2 SCM imports. Shows the BOM level, the assembly's SAP item and quantity,
// rolls up the cost and sell of every line beneath it, and collapses / expands them. Changing the quantity
// rescales every line under it (the SCM quantities are already totals for the model).
var BomAssemblyRow=memo(function BomAssemblyRow({item}){
var{locked,colVisibility,colOrder,isCIT,bomRoll,setBomQty,toggleBom,removeBomAssembly,sellCcy}=useContext(Ctx);
var{darkMode}=useContext(UiCtx);
var b=item.bom||{};
var r=(bomRoll&&bomRoll.get(item.id))||{parts:0,priced:0,cost:0,sell:0,ready:0,issues:0};
var[qtyDraft,setQtyDraft]=React.useState(null);
var[ctxMenu,setCtxMenu]=React.useState(null);
var color=bomDepthColor(b.depth||0);
var done=r.parts>0&&r.ready===r.parts;
var gm=r.sell>0?(1-r.cost/r.sell)*100:null;
var vis=gcsVisCols(colOrder,colVisibility,isCIT);
var firstTotal=vis.findIndex(k=>k==='cogs'||k==='landed'||k==='sellPrice'||k==='margins');
var labelSpan=1+(firstTotal<0?vis.length:firstTotal);
var after=firstTotal<0?[]:vis.slice(firstTotal);
var num={textAlign:'right',fontSize:11,fontWeight:600,whiteSpace:'nowrap',padding:'4px 6px',color:darkMode?'#e2e8f0':'#334155'};
var totalCell=k=>k==='cogs'?React.createElement("td",{key:k,style:num,"data-bom-cost":item.id,title:'Total cost of the lines in this assembly'},fc(r.cost)):
 k==='sellPrice'?React.createElement("td",{key:k,style:num,"data-bom-sell":item.id,title:'Total sell price of the lines in this assembly'},fc(r.sell)):
 k==='margins'&&gm!==null?React.createElement("td",{key:k,style:{...num,fontWeight:500,color:'#64748b'},title:'Gross margin on sell across the assembly'},`GM ${gm.toFixed(1)}%`):
 React.createElement("td",{key:k});
var commitQty=()=>{if(qtyDraft===null)return;var q=parseFloat(qtyDraft);setQtyDraft(null);if(q>0&&q!==b.qty)setBomQty(item.id,q);};
var bg=done?(darkMode?'rgba(22,101,52,0.35)':'#dcfce7'):(darkMode?'rgba(124,58,237,0.12)':'#f5f3ff');
var menu=ctxMenu?React.createElement(React.Fragment,null,
 React.createElement("div",{style:{position:'fixed',inset:0,zIndex:9990},onMouseDown:()=>setCtxMenu(null)}),
 React.createElement("div",{style:{position:'fixed',left:ctxMenu.x,top:ctxMenu.y,background:'#1e293b',color:'#f1f5f9',borderRadius:6,boxShadow:'0 4px 20px rgba(0,0,0,.4)',zIndex:9991,minWidth:230,fontSize:12,overflow:'hidden'}},
  [{label:'Expand all assemblies',act:()=>toggleBom('all',false)},{label:'Collapse all sub-assemblies',act:()=>toggleBom('subs',true)},
   ...(!locked?[{sep:true},{label:'Remove header (keep its lines)',act:()=>removeBomAssembly(item.id,false)},{label:'Delete assembly and all its lines',act:()=>removeBomAssembly(item.id,true),danger:true}]:[])]
  .map((m,i)=>m.sep?React.createElement("div",{key:i,style:{height:1,background:'#334155',margin:'2px 0'}}):
   React.createElement("div",{key:i,onMouseDown:()=>{m.act();setCtxMenu(null);},style:{padding:'7px 14px',cursor:'pointer',color:m.danger?'#f87171':'#f1f5f9'},onMouseEnter:e=>e.currentTarget.style.background='#334155',onMouseLeave:e=>e.currentTarget.style.background='transparent'},m.label)))):null;
var badge=React.createElement("span",{style:{display:'inline-flex',alignItems:'center',fontSize:9,fontWeight:700,lineHeight:1,padding:'2px 5px',borderRadius:3,background:color,color:'#fff',flexShrink:0}},'L'+(b.level??''));
return React.createElement(React.Fragment,null,menu,React.createElement("tr",{className:"pcw-heading-row pcw-bom-asm","data-bom-asm":item.id,"data-bom-depth":b.depth||0,"data-bom-done":done?'1':'0',
 onContextMenu:e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY});},style:{background:bg,borderTop:`1px solid ${darkMode?'#334155':'#e9e5fb'}`}},
 React.createElement("td",{colSpan:labelSpan,className:"py-1",style:{paddingLeft:6}},
  React.createElement("div",{style:{display:'flex',alignItems:'center',gap:6,minWidth:0,paddingLeft:(b.depth||0)*16,borderLeft:b.depth?`3px solid ${color}`:undefined,marginLeft:b.depth?0:undefined}},
   React.createElement("button",{type:'button',"data-bom-toggle":item.id,title:b.collapsed?'Show the lines in this assembly':'Hide the lines in this assembly',onClick:()=>toggleBom([item.id],!b.collapsed),
    style:{width:18,height:18,border:'none',background:'transparent',cursor:'pointer',fontSize:11,color:color,padding:0,flexShrink:0}},b.collapsed?'▸':'▾'),
   badge,
   React.createElement("span",{className:"pcw-mono",style:{fontSize:11,fontWeight:700,color:darkMode?'#e2e8f0':'#1e293b',flexShrink:0}},b.sap||''),
   React.createElement("span",{style:{fontSize:12,fontWeight:600,color:darkMode?'#e2e8f0':'#334155',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}},b.description||'Assembly'),
   b.drawing?React.createElement("span",{className:"pcw-mono",style:{fontSize:10,color:'#94a3b8',flexShrink:0}},b.drawing):null,
   b.tag?React.createElement("span",{style:{fontSize:9,padding:'1px 5px',borderRadius:3,background:darkMode?'#334155':'#e2e8f0',color:darkMode?'#cbd5e1':'#475569',flexShrink:0}},b.tag):null,
   React.createElement("span",{style:{fontSize:10,color:'#64748b',flexShrink:0,marginLeft:4}},'×'),
   React.createElement("input",{type:'number',min:0,step:'any',"data-bom-qty":item.id,readOnly:locked,value:qtyDraft!==null?qtyDraft:String(b.qty??1),title:'Assembly quantity — changing it rescales every line under this assembly',
    onChange:e=>setQtyDraft(e.target.value),onBlur:commitQty,onKeyDown:e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setQtyDraft(null);}},
    className:"pcw-input",style:{width:58,height:20,fontSize:11,padding:'0 4px',textAlign:'right',flexShrink:0}}),
   React.createElement("span",{"data-bom-parts":item.id,style:{fontSize:10,color:done?'#15803d':'#64748b',flexShrink:0,whiteSpace:'nowrap'}},`${r.parts} line${r.parts===1?'':'s'} · ${r.priced} costed${r.ready?` · ${r.ready} ready`:''}`),
   r.issues?React.createElement("span",{title:`${r.issues} line${r.issues===1?'':'s'} in this assembly have SCM data issues`,style:{fontSize:10,color:'#b45309',flexShrink:0}},`⚠ ${r.issues}`):null,
   item.scm&&item.scm.issues&&item.scm.issues.length?React.createElement("span",{title:scmIssueText(item),style:{fontSize:10,color:'#b45309',flexShrink:0}},'⚠'):null,
   firstTotal<0?React.createElement("span",{style:{marginLeft:'auto',fontSize:11,fontWeight:600}},`${fc(r.cost)} / ${fc(r.sell)} ${sellCcy}`):null)),
 after.map(totalCell)));
});
