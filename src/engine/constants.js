

const { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext, memo, startTransition } = React;

const CURRENCIES   = ["USD","GBP","EUR","ARS","BRL"];
const BE_EMPTY_DEF = {margin:'',contingency:'',discount:'',tariff:'',unitCost:'',supplier:'',ccy:'',source:'',leadTime:'',imported:'',afrmm:''};
const BZ_EMPTY_DEF = {ncm:'',ii:'',ipi:'',pis:'',cofins:'',icmsBase:'',icms:''};
const BUS          = ["CIW","ECL","CIT","CIA"];
const SOURCES      = ["","Quotation","Pricelist","Project Cost","Item Cost Use Guidance","Estimate"];
const INCOTERMS    = ["EXW","FCA","FAS","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"];
const DEF_RATES    = {USD:1,GBP:0.79,EUR:0.92,ARS:1000,BRL:5.80};
const uid          = () => Math.random().toString(36).slice(2,9);

const BR_STATES = {
"AC": {name:"Acre",           region:"North",      intrastate:17},
"AP": {name:"Amapá",          region:"North",      intrastate:18},
"AM": {name:"Amazonas",       region:"North",      intrastate:18},
"PA": {name:"Pará",           region:"North",      intrastate:17},
"RO": {name:"Rondônia",       region:"North",      intrastate:17.5},
"RR": {name:"Roraima",        region:"North",      intrastate:17},
"TO": {name:"Tocantins",      region:"North",      intrastate:18},
"AL": {name:"Alagoas",        region:"Northeast",  intrastate:18},
"BA": {name:"Bahia",          region:"Northeast",  intrastate:18},
"CE": {name:"Ceará",          region:"Northeast",  intrastate:18},
"MA": {name:"Maranhão",       region:"Northeast",  intrastate:18},
"PB": {name:"Paraíba",        region:"Northeast",  intrastate:18},
"PE": {name:"Pernambuco",     region:"Northeast",  intrastate:18},
"PI": {name:"Piauí",          region:"Northeast",  intrastate:18},
"RN": {name:"Rio Grande do Norte",region:"Northeast",intrastate:18},
"SE": {name:"Sergipe",        region:"Northeast",  intrastate:18},
"DF": {name:"Distrito Federal",region:"Center-West",intrastate:18},
"GO": {name:"Goiás",          region:"Center-West",intrastate:17},
"MT": {name:"Mato Grosso",    region:"Center-West",intrastate:17},
"MS": {name:"Mato Grosso do Sul",region:"Center-West",intrastate:17},
"ES": {name:"Espírito Santo", region:"Southeast",  intrastate:17},
"MG": {name:"Minas Gerais",   region:"Southeast",  intrastate:18},
"RJ": {name:"Rio de Janeiro", region:"Southeast",  intrastate:20},
"SP": {name:"São Paulo",      region:"Southeast",  intrastate:18},
"PR": {name:"Paraná",         region:"South",      intrastate:18},
"RS": {name:"Rio Grande do Sul",region:"South",    intrastate:18},
"SC": {name:"Santa Catarina", region:"South",      intrastate:17},
};

const calcICMSRate = (originState, destState) => {
if (!originState || !destState) return 18; // default
if (originState === destState) {
 return BR_STATES[destState]?.intrastate || 18;
}

const origin = BR_STATES[originState];
const dest = BR_STATES[destState];
if (!origin || !dest) return 18;

const southSoutheast = ["South", "Southeast"];
const others = ["North", "Northeast", "Center-West"];

if (southSoutheast.includes(origin.region) && others.includes(dest.region)) {
 return 7; // South/Southeast → North/Northeast/Center-West
}
return 12; // All other interstate operations
};

const SOURCE_SCORE = {"":0,Quotation:5,Pricelist:4,"Project Cost":3,"Item Cost Use Guidance":3,Estimate:2};

// Salesforce object type threshold
const SF_QUOTE_THRESHOLD = 75000; // USD — quotes >= this should be Opportunities, below = Cases

function parseSalesforceLink(url) {
 if (!url || !url.trim()) return { type: null, id: null };
 // Lightning URL: /lightning/r/Opportunity/006.../view or /lightning/r/Case/500.../view
 const lightningMatch = url.match(/\/lightning\/r\/(Opportunity|Case)\/([a-zA-Z0-9]{15,18})/i);
 if (lightningMatch) return { type: lightningMatch[1], id: lightningMatch[2] };
 // Classic URL: salesforce.com/006... or salesforce.com/500...
 const classicMatch = url.match(/salesforce\.com\/([a-zA-Z0-9]{15,18})/i);
 if (classicMatch) {
  const id = classicMatch[1];
  if (id.startsWith('006')) return { type: 'Opportunity', id };
  if (id.startsWith('500')) return { type: 'Case', id };
 }
 // Any URL containing /Case/ or /Opportunity/
 if (/\/Opportunity\//i.test(url)) return { type: 'Opportunity', id: null };
 if (/\/Case\//i.test(url)) return { type: 'Case', id: null };
 return { type: null, id: null };
}
const CONF_COLOR   = ["","#dc2626","#ea580c","#ca8a04","#2563eb","#16a34a"];
const CONF_LABEL   = ["","Very Low","Low","Medium","High","Very High"];

const getConfidence = (source) => {
const score = SOURCE_SCORE[source] ?? 3;
if (score === 5) return "Very High";
if (score === 4) return "High";
if (score === 3) return "Medium";
if (score === 2) return "Low";
return "Very Low";
};
const BR_DEFAULTS  = {ncm:"",ii:20,ipi:0,pis:1.65,cofins:7.6,icms:12,icmsBase:100};
const MAX_FREIGHT  = 20;