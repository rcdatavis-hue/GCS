

const initProj = {
name:"",ref:"",rev:"0",bu:"CIW",
customer:{name:"",code:"",ref:"",country:""},
sellCcy:"USD",rates:{...DEF_RATES},
defaultMargin:0,defaultContingency:0,defaultDealer:0,discountMitigation:0,
sAndAExpense:10, // Sales & Admin expense % for EBITDA calculation
source:"",notes:"",
incoterm:"EXW",freightPaymentTerm:"",paymentTerms:"",insideSales:"",outsideSales:"",
rfqDate:"",       // RFQ / Quote issue date
revisionDate:"",  // Revision date
afrmmRate:8, // AFRMM rate for CIT
customsCharges:9, // Customs clearance charges % (CIT only)
recapBenefit:"N", // Tariff Benefits (RECAP): Y/N
salesType:"Industrialized", // Sales Type: Industrialized/Direct
locked: false, // When true, all fields are read-only
ratesRefreshedAt: null, // ISO timestamp when rates were last refreshed from feed
packagedAt: null, // ISO timestamp when the save package was last generated (auto-locks on package)
approvals: [], // Approval/unlock audit log — array of {type, at, grandTotal, sellCcy, revision, stateHash}
};

const makeFreightEntry = (hasMargin=false, isInbound=false) => ({
id:uid(), desc:"", cost:0, ccy:"USD", leadTimeDays:0, freightQuotes:[], activeQuoteId:null, ...(hasMargin?{margin:0}:{}), ...(isInbound?{afrmm:false, supplierTags:[]}:{})
});

const initFrt = { inbound:[], outbound:[], packingCrating:{enabled:false,pct:0,overrideAmt:null} };

const makePhases = () => [
{id:uid(),name:"PO Processing",days:0},
{id:uid(),name:"Engineering Queue",days:0},
{id:uid(),name:"Engineering Time",days:0},
{id:uid(),name:"Approval Drawings",days:0},
{id:uid(),name:"Finalise Drawings",days:0},
{id:uid(),name:"Fabrication",days:0},
{id:uid(),name:"Inspection",days:0},
{id:uid(),name:"Packing",days:0},
{id:uid(),name:"Customs Clearance",days:0},
{id:uid(),name:"Inbound Freight",days:0},
{id:uid(),name:"Outbound Freight",days:0},
{id:uid(),name:"Contingency",days:0},
];

const Ctx   = createContext(null);
const UiCtx = createContext(null); // volatile UI state — separate to avoid re-rendering all rows on hover/focus/drag

