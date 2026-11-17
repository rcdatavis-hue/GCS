var HeadingRow=memo(function HeadingRow({item}){
var{updItem,removeItem,reorderItem,setDraggedItem,setDropTarget,colVisibility,locked,insertItemAt,insertHeadingAt,duplicateItem}=useContext(Ctx);
var{draggedItem,dropTarget,rowColors,setRowColors,darkMode}=useContext(UiCtx);
var isDragging=draggedItem===item.id;
var isDropTarget=dropTarget?.id===item.id;
var visibleColCount=1+Object.values(colVisibility).filter(Boolean).length;
var[ctxMenu,setCtxMenu]=React.useState(null);
var headingColor=rowColors[item.id];
var menuItems=[
 ...(!locked?[
  {label:'\u2795 Insert Row Above',action:()=>{insertItemAt(item.id,'above');setCtxMenu(null);}},
  {label:'\u2795 Insert Row Below',action:()=>{insertItemAt(item.id,'below');setCtxMenu(null);}},
  {sep:true},
  {label:'\ud83d\udccc Insert Header Above',action:()=>{insertHeadingAt(item.id,'above');setCtxMenu(null);}},
  {label:'\ud83d\udccc Insert Header Below',action:()=>{insertHeadingAt(item.id,'below');setCtxMenu(null);}},
  {sep:true},
  {label:'\ud83d\udccb Duplicate Header',action:()=>{duplicateItem(item.id);setCtxMenu(null);}},
  {label:'\ud83d\uddd1\ufe0f Delete This Header',action:()=>{removeItem(item.id);setCtxMenu(null);},danger:true}
 ]:[]),
 ...(!locked?[{palette:true}]:[])
];
var swatches=darkMode?[{color:'#854d0e',label:'Yellow'},{color:'#14532d',label:'Green'},{color:'#1e3a5f',label:'Blue'},{color:'#7f1d1d',label:'Red'},{color:'#3b0764',label:'Purple'},{color:'#7c2d12',label:'Orange'},{color:'#1e293b',label:'Grey'}]:[{color:'#fef08a',label:'Yellow'},{color:'#bbf7d0',label:'Green'},{color:'#bfdbfe',label:'Blue'},{color:'#fecaca',label:'Red'},{color:'#e9d5ff',label:'Purple'},{color:'#fed7aa',label:'Orange'},{color:'#f1f5f9',label:'Grey'}];
var menuNode=ctxMenu?React.createElement(React.Fragment,null,
 React.createElement("div",{style:{position:'fixed',inset:0,zIndex:9990},onMouseDown:()=>setCtxMenu(null)}),
 React.createElement("div",{style:{position:'fixed',left:ctxMenu.x,top:ctxMenu.y,background:'#1e293b',color:'#f1f5f9',borderRadius:6,boxShadow:'0 4px 20px rgba(0,0,0,.4)',zIndex:9991,minWidth:190,fontSize:12,overflow:'hidden'}},
  menuItems.map((mi,i)=>{
   if(mi.sep)return React.createElement("div",{key:i,style:{height:1,background:'#334155',margin:'2px 0'}});
   if(mi.palette)return React.createElement("div",{key:i,style:{padding:'6px 14px',borderTop:'1px solid #334155'}},
    React.createElement("div",{style:{fontSize:10,color:'#64748b',marginBottom:5}},"Row highlight"),
    React.createElement("div",{style:{display:'flex',gap:5,alignItems:'center'}},
     swatches.map(sw=>React.createElement("div",{key:sw.color,title:sw.label,onMouseDown:()=>{setRowColors(r=>{var c={...r};if(headingColor===sw.color){delete c[item.id];}else{c[item.id]=sw.color;}return c;});setCtxMenu(null);},style:{width:18,height:18,borderRadius:3,background:sw.color,cursor:'pointer',flexShrink:0,border:headingColor===sw.color?'2px solid #fff':'1px solid rgba(255,255,255,0.2)',boxSizing:'border-box'}}))
    )
   );
   return React.createElement("div",{key:i,onMouseDown:()=>mi.action(),style:{padding:'7px 14px',cursor:'pointer',color:mi.danger?'#f87171':'#f1f5f9'},onMouseEnter:e=>e.currentTarget.style.background='#334155',onMouseLeave:e=>e.currentTarget.style.background='transparent'},mi.label);
  })
 )
):null;
var trNode=React.createElement("tr",{className:"pcw-heading-row group",draggable:"true",onContextMenu:!locked?e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY});}:undefined,onDragStart:e=>{setDraggedItem(item.id);e.dataTransfer.effectAllowed='move';},onDragEnd:()=>{setDraggedItem(null);setDropTarget(null);},onDragOver:e=>{e.preventDefault();if(draggedItem&&draggedItem!==item.id){var rect=e.currentTarget.getBoundingClientRect();var midpoint=rect.top+rect.height/2;var position=e.clientY<midpoint?'before':'after';setDropTarget({id:item.id,position});}},onDragLeave:()=>{setDropTarget(null);},onDrop:e=>{e.preventDefault();if(draggedItem&&draggedItem!==item.id&&dropTarget){reorderItem(draggedItem,item.id,dropTarget.position);}setDraggedItem(null);setDropTarget(null);},style:{opacity:isDragging?0.5:1,borderTop:isDropTarget&&dropTarget.position==='before'?'3px solid #3b82f6':undefined,borderBottom:isDropTarget&&dropTarget.position==='after'?'3px solid #3b82f6':undefined,cursor:'grab'}},
 React.createElement("td",{colSpan:visibleColCount,className:"px-3 py-1.5"},
  React.createElement("div",{className:"flex items-center gap-2"},
   React.createElement("span",{className:"pcw-drag-handle"},"\u22EE\u22EE"),
   React.createElement("span",{className:"pcw-heading-tag"},"\xA7"),
   React.createElement("input",{className:"pcw-heading-input flex-1","data-heading-id":item.id,value:item.text||"",onChange:e=>!locked&&updItem(item.id,"text",e.target.value),readOnly:locked,placeholder:"Section heading\u2026",onDragStart:e=>e.stopPropagation(),draggable:"false"}),
   !locked&&React.createElement("button",{className:"pcw-btn-rm opacity-0 group-hover:opacity-100 transition-opacity",onClick:()=>removeItem(item.id)},"\u2715")
  )
 )
);
return React.createElement(React.Fragment,null,menuNode,trNode);
});