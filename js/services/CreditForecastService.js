/* Agreement-level credit forecasting. Organization filters never enter this service. */
(() => {
  'use strict';
  const OOP=(window.AVEVA_OOP=window.AVEVA_OOP||{}),DAY_MS=864e5;
  OOP.CreditForecastService=class CreditForecastService{
    constructor({config,repository,utils}){Object.assign(this,{config,repository,utils});}
    parseConfigDate(value,endOfDay=false){const[year,month,day]=value.split('-').map(Number);return new Date(year,month-1,day,endOfDay?23:0,endOfDay?59:0,endOfDay?59:0,endOfDay?999:0);}
    normalize(rows=this.repository.burndown){return(rows||[]).filter(row=>row.date instanceof Date&&!Number.isNaN(row.date.getTime())&&Number.isFinite(row.balance)).slice().sort((a,b)=>a.date-b.date||a.sourceOrder-b.sourceOrder);}
    latest(rows=this.normalize()){const row=rows[rows.length-1];return row?{date:row.date,balance:row.balance}:null;}
    daily(rows=this.normalize()){const byDay=new Map();rows.forEach(row=>{const key=[row.date.getFullYear(),String(row.date.getMonth()+1).padStart(2,'0'),String(row.date.getDate()).padStart(2,'0')].join('-'),current=byDay.get(key);if(!current||row.date>current.date||(row.date.getTime()===current.date.getTime()&&row.sourceOrder<current.sourceOrder))byDay.set(key,{date:row.date,balance:row.balance,sourceOrder:row.sourceOrder});});return[...byDay.values()].sort((a,b)=>a.date-b.date);}
    burnRate(daily=this.daily()){if(daily.length<2)return null;const first=daily[0],last=daily[daily.length-1],elapsed=(last.date-first.date)/DAY_MS;if(!(elapsed>0))return null;return Math.max(0,(first.balance-last.balance)/elapsed);}
    forecast(daily=this.daily(),burnRate=this.burnRate(daily)){if(!daily.length||!(burnRate>0))return[];const latest=daily[daily.length-1],end=this.parseConfigDate(this.config.credit.contractEndDate,true),points=[{date:latest.date,balance:latest.balance}],cursor=new Date(latest.date.getFullYear(),latest.date.getMonth()+1,1);while(cursor<end){points.push({date:new Date(cursor),balance:latest.balance-burnRate*((cursor-latest.date)/DAY_MS)});cursor.setMonth(cursor.getMonth()+1);}points.push({date:end,balance:latest.balance-burnRate*((end-latest.date)/DAY_MS)});return points;}
    ideal(){return[{date:this.parseConfigDate(this.config.credit.contractStartDate),balance:this.config.credit.initialCredits},{date:this.parseConfigDate(this.config.credit.contractEndDate,true),balance:0}];}
    status(latest,burnRate){const contractEnd=this.parseConfigDate(this.config.credit.contractEndDate,true),criticalDate=this.parseConfigDate(this.config.credit.criticalDate,true),depletion=latest&&burnRate>0?new Date(latest.date.getTime()+(latest.balance/burnRate)*DAY_MS):null,status=!latest?'N/A':!depletion||depletion>=contractEnd?'GREEN':depletion<=criticalDate?'RED':'YELLOW';return{status,depletion,contractEnd};}
    calculate(scope={mode:'ALL',end:null}){const all=this.normalize(),rows=scope.mode==='ALL'?all:all.filter(row=>row.date<=scope.end),daily=this.daily(rows),latest=this.latest(rows),burnRate=this.burnRate(daily);return{rows,daily,latest,burnRate,forecast:this.forecast(daily,burnRate),ideal:this.ideal(),status:this.status(latest,burnRate)};}
  };
})();
