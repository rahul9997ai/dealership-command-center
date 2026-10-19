/* =====================================================================
   MAHANEX DEALERSHIP COMMAND
   Layer 1: DATA — brands, colour presets, packages, product template
   ===================================================================== */
(function () {
"use strict";

/* Brand registry. finLabel is the customer-facing financial services name. */
/* pal = the brand's own two-colour look for the customer display, prints and email: main (header
   band, package titles) and accent (icons, prices, highlights). From published brand guidelines:
   Toyota red EB0A1E; Kia Midnight Black 05141F and Kia Gold 85754E. The others are the commonly
   cited values (no official figure found) — swap in a brand kit's exact values when available.
   color = the older single colour, still used for a custom ("Other") brand. */
var BRANDS = {
  nissan:   { key:"nissan",   label:"Nissan",    mark:"NIS", color:"#2c5a9b", finLabel:"NISSAN FINANCIAL SERVICES", pal:{ main:"#111111", accent:"#C3002F", names:["Black","Nissan red"] } },
  infiniti: { key:"infiniti", label:"INFINITI",  mark:"INF", color:"#3c4654", finLabel:"INFINITI FINANCIAL SERVICES", pal:{ main:"#111111", accent:"#A5A5A5", names:["Black","Silver"] } },
  toyota:   { key:"toyota",   label:"Toyota",    mark:"TOY", color:"#a3282f", finLabel:"TOYOTA FINANCIAL SERVICES", pal:{ main:"#EB0A1E", accent:"#1A1A1A", names:["Toyota red","Black"] } },
  honda:    { key:"honda",    label:"Honda",     mark:"HON", color:"#a3282f", finLabel:"HONDA FINANCIAL SERVICES", pal:{ main:"#CC0000", accent:"#1A1A1A", names:["Honda red","Black"] } },
  ford:     { key:"ford",     label:"Ford",      mark:"FRD", color:"#1f4a8a", finLabel:"FORD CREDIT FINANCIAL SERVICES", pal:{ main:"#003478", accent:"#2D6CC0", names:["Ford blue","Bright blue"] } },
  hyundai:  { key:"hyundai",  label:"Hyundai",   mark:"HYU", color:"#1f3a68", finLabel:"HYUNDAI MOTOR FINANCE", pal:{ main:"#002C5F", accent:"#00AAD2", names:["Hyundai blue","Sky blue"] } },
  kia:      { key:"kia",      label:"Kia",       mark:"KIA", color:"#8a2b3a", finLabel:"KIA FINANCE", pal:{ main:"#05141F", accent:"#85754E", names:["Midnight black","Kia gold"] } },
  chevrolet:{ key:"chevrolet",label:"Chevrolet", mark:"CHV", color:"#9a7420", finLabel:"GM FINANCIAL", pal:{ main:"#1A1A1A", accent:"#D4AF37", names:["Black","Bowtie gold"] } },
  mazda:    { key:"mazda",    label:"Mazda",     mark:"MZD", color:"#8a2b3a", finLabel:"MAZDA FINANCIAL SERVICES", pal:{ main:"#101010", accent:"#910A1C", names:["Black","Mazda red"] } },
  bmw:      { key:"bmw",      label:"BMW",       mark:"BMW", color:"#1f3a68", finLabel:"BMW FINANCIAL SERVICES", pal:{ main:"#0066B1", accent:"#262626", names:["BMW blue","Black"] } },
  subaru:   { key:"subaru",   label:"Subaru",    mark:"SUB", color:"#1f4a8a", finLabel:"SUBARU FINANCIAL SERVICES", pal:{ main:"#013C74", accent:"#1971D4", names:["Subaru blue","Pleiades blue"] } },
  volkswagen:{key:"volkswagen",label:"Volkswagen",mark:"VW", color:"#1f3a68", finLabel:"VOLKSWAGEN FINANCIAL SERVICES", pal:{ main:"#001E50", accent:"#00B0F0", names:["VW blue","Light blue"] } },
  acura:    { key:"acura",    label:"Acura",     mark:"ACU", color:"#3c4654", finLabel:"ACURA FINANCIAL SERVICES", pal:{ main:"#111111", accent:"#E40521", names:["Black","Acura red"] } },
  lexus:    { key:"lexus",    label:"Lexus",     mark:"LEX", color:"#3c4654", finLabel:"LEXUS FINANCIAL SERVICES", pal:{ main:"#111111", accent:"#99877D", names:["Black","Lexus grey"] } },
  genesis:  { key:"genesis",  label:"Genesis",   mark:"GEN", color:"#3c4654", finLabel:"GENESIS FINANCE", pal:{ main:"#111111", accent:"#A36B4F", names:["Black","Genesis copper"] } },
  mitsubishi:{key:"mitsubishi",label:"Mitsubishi",mark:"MIT", color:"#a3282f", finLabel:"MITSUBISHI FINANCIAL SERVICES", pal:{ main:"#E60012", accent:"#1A1A1A", names:["Mitsubishi red","Black"] } }
};
/* Colour schemes a General Manager can pick for the customer display. */
var COLOR_PRESETS = [
  { name:"Classic blue", color:"#2c5a9b" }, { name:"Navy", color:"#1f3a68" }, { name:"Teal", color:"#14707a" },
  { name:"Forest", color:"#2e6b4f" }, { name:"Crimson", color:"#a3282f" }, { name:"Burgundy", color:"#8a2b3a" },
  { name:"Charcoal", color:"#3c4654" }, { name:"Bronze", color:"#9a7420" }
];

/* The three presentation packages. The brand name is prefixed at runtime,
   so a Nissan store sees NISSAN PREFERRED and a Ford store sees FORD PREFERRED. */
var PACKAGES = [
  { key:"preferred", suffix:"PREFERRED", blurb:"Everything we recommend" },
  { key:"essential", suffix:"ESSENTIAL", blurb:"The coverage most owners keep" },
  { key:"basic",     suffix:"BASIC",     blurb:"Core protection only" }
];

/* Dealership group — a master administrator can create more of these. */
var DEALERSHIPS = [];

var USERS = [
  { id:"u0", name:"Master Administrator", initials:"MA", role:"Master Administrator", email:"", password:"", dealershipId:null, active:true, demo:false, accessDays:null, restrictions:["All dealerships"] }
];

/* Product master. desc is used only in the emailed presentation, never on the
   customer display. benefit is the persuasive line used in that email. */
var PRODUCTS = [
  {
    id:"asp", code:"ASP", name:"ASP/CPO Platinum Program", category:"Mechanical", active:true, taxRule:"standard",
    uses:{ term:true, km:true, deductible:true, interval:false },
    terms:[36,48,60,72,84,96,120], kms:[60000,80000,100000,120000,160000,200000], deductibles:[0,100,200],
    cost:502,
    desc:"Platinum level mechanical coverage on the components that cost the most to repair, including parts, labour and diagnostic time, honoured at any authorized dealer in Canada.",
    benefit:"One covered repair usually costs more than the whole program. This keeps a four figure repair bill from landing on you three years from now, and it transfers to the next owner, which protects your resale value.",
    pricing:{ base:1195, term:{36:0,48:220,60:430,72:690,84:960,96:1240,120:1640}, km:{60000:0,80000:130,100000:260,120000:390,160000:640,200000:900}, deductible:{0:260,100:110,200:0} }
  },
  {
    id:"ppm", code:"PPM", name:"Prepaid Maintenance", category:"Maintenance", active:true, taxRule:"standard",
    uses:{ term:false, km:true, deductible:false, interval:true },
    kms:[24000,40000,60000,80000,100000,120000], intervals:[8000,12000,16000],
    cost:217,
    desc:"Prepays your scheduled maintenance visits at today's prices, including oil and filter changes, multi point inspections and tire rotations.",
    benefit:"Service prices go up every year. You are locking in today's price, the work is done by factory trained technicians, and your maintenance record stays complete, which is exactly what a buyer or an appraiser wants to see.",
    pricing:{ base:395, km:{24000:0,40000:240,60000:470,80000:690,100000:900,120000:1120}, interval:{8000:290,12000:150,16000:0} }
  },
  {
    id:"trp", code:"TRP", name:"Tire & Rim Protection", category:"Road Hazard", active:true, taxRule:"standard",
    uses:{ term:true, km:false, deductible:false, interval:false }, terms:[36,48,60,72,84],
    cost:226,
    desc:"Repairs or replaces tires and rims damaged by potholes, nails, glass and other road hazards, with no limit on the number of claims.",
    benefit:"A single wheel and tire on this vehicle runs several hundred dollars, and our roads are hard on both. There is no claim limit, so one bad pothole in year two has already paid for the coverage.",
    pricing:{ base:595, term:{36:0,48:120,60:240,72:360,84:480} }
  },
  {
    id:"app", code:"APP", name:"Appearance Protection", category:"Appearance", active:true, taxRule:"standard",
    uses:{ term:true, km:false, deductible:false, interval:false }, terms:[36,48,60,72,84],
    cost:255,
    desc:"Paint and interior protection against acid rain, bird droppings, tree sap, road salt, rips, burns and permanent staining.",
    benefit:"Winter salt and summer sap are what make a three year old car look five. This keeps the finish and the interior looking the way it does today, and that shows up directly in what the vehicle is worth at trade in.",
    pricing:{ base:749, term:{36:0,48:100,60:200,72:300,84:400} }
  },
  {
    id:"atr", code:"ATR", name:"Anti-Theft & Recovery", category:"Security", active:true, taxRule:"standard",
    uses:{ term:true, km:false, deductible:false, interval:false }, terms:[36,48,60,72,84,96],
    cost:150,
    desc:"Etched vehicle identification and a recovery service that works with police to locate your vehicle, plus a benefit toward a replacement if it is not recovered.",
    benefit:"Vehicles in this segment are among the most targeted in the province. Etching makes yours far less attractive to a thief, and if it does go missing you get help recovering it plus a benefit toward the replacement.",
    pricing:{ base:499, term:{36:0,48:80,60:160,72:240,84:320,96:400} }
  },
  {
    id:"vrc", code:"VRC", name:"Vehicle Replacement Coverage", category:"Insurance", active:true, taxRule:"vrc",
    uses:{ term:true, km:false, deductible:false, interval:false }, terms:[36,48,60,72,84],
    cost:403,
    desc:"If your vehicle is written off as a total loss, this coverage puts you into a comparable new vehicle rather than settling for depreciated value.",
    benefit:"Your insurer pays what the vehicle is worth on the day of the loss, not what it costs to replace it. This covers that gap with a new vehicle instead of a cheque that leaves you shopping with less than you started with.",
    pricing:{ base:895, term:{36:0,48:150,60:300,72:450,84:600} }
  },
  {
    id:"gap", code:"GAP", name:"Guaranteed Asset Protection", category:"Loan", active:true, taxRule:"standard",
    uses:{ term:true, km:false, deductible:false, interval:false }, terms:[48,60,72,84,96],
    cost:278,
    desc:"Covers the gap between your insurance settlement and the balance remaining on your finance contract if the vehicle is stolen or written off.",
    benefit:"On a longer term the balance owing stays above the vehicle's value for the first few years. Without this you can lose the vehicle and still owe thousands on it. This closes that gap so a total loss does not follow you.",
    pricing:{ base:695, term:{48:0,60:120,72:240,84:360,96:480} }
  },
  {
    id:"key", code:"KEY", name:"Key Replacement", category:"Convenience", active:true, taxRule:"standard",
    uses:{ term:true, km:false, deductible:false, interval:false }, terms:[36,48,60,72],
    cost:112,
    desc:"Replaces lost, stolen or damaged keys and remotes, including cutting, programming and roadside lockout assistance.",
    benefit:"A single smart key for this vehicle is a few hundred dollars once it is cut and programmed. This replaces them and gets you back on the road the same day instead of waiting on a tow.",
    pricing:{ base:349, term:{36:0,48:60,60:120,72:180} }
  },
  {
    id:"cpp", code:"CPP", name:"Ceramic Paint Protection", category:"Appearance", active:true, taxRule:"standard",
    uses:{ term:true, km:false, deductible:false, interval:false }, terms:[36,60,84],
    cost:null,
    desc:"A professionally applied ceramic coating that protects the factory finish and makes the vehicle easier to keep clean.",
    benefit:"The coating does the work a weekly wash cannot. Dirt and road film release far more easily, and the factory finish stays sharp instead of dulling out over the first few winters.",
    pricing:null   /* deliberately not configured — the FSM must enter a price */
  }
];

var CUSTOMERS = [];
var VEHICLES = [];


window.__DCC_DATA__ = { COLOR_PRESETS:COLOR_PRESETS, BRANDS:BRANDS, PACKAGES:PACKAGES, DEALERSHIPS:DEALERSHIPS, USERS:USERS,
  PRODUCTS:PRODUCTS, CUSTOMERS:CUSTOMERS, VEHICLES:VEHICLES };
})();
