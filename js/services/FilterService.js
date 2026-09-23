/* Owns filter DOM, scoping, cascades, and organization-aware transaction filtering. */
(() => {
  'use strict';
  const OOP=(window.AVEVA_OOP=window.AVEVA_OOP||{});
  OOP.FilterService=class FilterService{
    constructor({repository,state,config,utils,documentRef=document,translate=(key)=>key}){Object.assign(this,{repository,state,config,utils,document:documentRef,translate});}
    byId(id){return this.document.getElementById(id);}
    currentYear(){return new Date().getFullYear();}
    defaultYear(){return this.currentYear();}
    latestDataYear(){const years=[...this.repository.viewUsage.map(row=>row.year),...this.repository.planHours.map(row=>row.year),...this.repository.transactions.map(row=>row.date instanceof Date?row.date.getFullYear():null)].filter(Number.isFinite);return years.length?Math.max(...years):this.currentYear();}
    get values(){const year=this.byId('fYear').value;const filters={company:this.byId('fCompany').value,department:this.byId('fDept').value,user:this.byId('fUser').value,year,month:year?this.byId('fMonth').value:'',startDate:this.byId('fStartDate').value,endDate:this.byId('fEndDate').value};this.state.filters={...filters};return filters;}
    syncYearMonth(){const year=this.byId('fYear'),month=this.byId('fMonth'),hasYear=Boolean(year.value);if(!hasYear)month.value='';month.disabled=!hasYear;}
    setOptions(elementId,key,allLabel,rows){const element=this.byId(elementId),selected=element.value;element.replaceChildren(new Option(allLabel,''));[...new Set(rows.map(row=>row[key]))].filter(value=>value!==null&&value!==undefined&&value!=='').sort().forEach(value=>element.add(new Option(value,value)));if([...element.options].some(option=>option.value===selected))element.value=selected;}
    fill(){
      const selectedCompany=this.byId('fCompany').value,selectedDepartment=this.byId('fDept').value,selectedUser=this.byId('fUser').value;
      this.setOptions('fCompany','company','All Companies',this.repository.viewUsage);
      this.setOptions('fDept','department','All Department',this.repository.viewUsage.filter(row=>!selectedCompany||row.company===selectedCompany));
      this.setOptions('fUser','name','All Users',this.repository.viewUsage.filter(row=>(!selectedCompany||row.company===selectedCompany)&&(!selectedDepartment||row.department===selectedDepartment)));
      if(selectedUser&&[...this.byId('fUser').options].some(option=>option.value===selectedUser))this.byId('fUser').value=selectedUser;
      const dates=this.repository.transactions.map(row=>row.date).filter(date=>date instanceof Date&&!Number.isNaN(date.getTime()));
      const years=[...new Set([this.currentYear(),this.defaultYear(),...this.repository.viewUsage.map(row=>row.year),...this.repository.planHours.map(row=>row.year),...dates.map(date=>date.getFullYear())])].filter(Number.isFinite).sort((a,b)=>a-b);
      const months=[...new Set([...this.repository.viewUsage.map(row=>row.month),...dates.map(date=>date.getMonth()+1)])].filter(Number.isFinite).sort((a,b)=>a-b);
      const yearElement=this.byId('fYear'),monthElement=this.byId('fMonth'),selectedYear=yearElement.value,selectedMonth=monthElement.value;
      yearElement.replaceChildren(new Option(this.translate('allYear'),''));years.forEach(year=>yearElement.add(new Option(year,year)));
      monthElement.replaceChildren(new Option(this.translate('allMonth'),''));months.forEach(month=>monthElement.add(new Option(month,month)));
      const loaded=this.repository.viewUsage.length||this.repository.planHours.length||this.repository.transactions.length;
      yearElement.value=selectedYear||(loaded?String(this.defaultYear()):'');monthElement.value=selectedMonth;this.syncYearMonth();
    }
    validateDateRange(){const{startDate,endDate}=this.values,error=this.byId('dateFilterError');let message='';if(Boolean(startDate)!==Boolean(endDate))message='Select both Start Date and End Date.';else if(startDate&&endDate&&startDate>endDate)message='Start Date must be on or before End Date.';error.textContent=message;error.hidden=!message;return!message;}
    filterTransactionsByOrganization(rows,filters=this.values){if(!(filters.company||filters.department||filters.user))return rows.slice();return rows.filter(row=>{const employee=this.repository.findEmployee(row.user);return employee&&(!filters.company||employee.company===filters.company)&&(!filters.department||employee.department===filters.department)&&(!filters.user||employee.name===filters.user);});}
    transactions({rows=this.repository.transactions,applyDate=true,agreementOnly=true}={}){const filters=this.values;let result=agreementOnly?rows.filter(row=>row.agreementId===this.config.activeAgreement):rows.slice();result=this.filterTransactionsByOrganization(result,filters);if(!applyDate)return result;const range=filters.startDate&&filters.endDate,start=range?new Date(`${filters.startDate}T00:00:00`):null,end=range?new Date(`${filters.endDate}T23:59:59.999`):null;return result.filter(row=>row.date instanceof Date&&!Number.isNaN(row.date.getTime())&&(range?row.date>=start&&row.date<=end:(!filters.year||String(row.date.getFullYear())===String(filters.year))&&(!filters.month||String(row.date.getMonth()+1)===String(filters.month))));}
    usageRows(){const filters=this.values,range=filters.startDate&&filters.endDate,start=range?new Date(`${filters.startDate}T00:00:00`):null,end=range?new Date(`${filters.endDate}T23:59:59.999`):null;return this.repository.viewUsage.filter(row=>{const date=row.start instanceof Date?row.start:new Date(row.start);return(!filters.company||row.company===filters.company)&&(!filters.department||row.department===filters.department)&&(!filters.user||row.name===filters.user)&&(range?date>=start&&date<=end:(!filters.year||String(row.year)===String(filters.year))&&(!filters.month||String(row.month)===String(filters.month)));});}
    dateScope(){const{startDate,endDate,year:yearValue,month:monthValue}=this.values;if(startDate&&endDate)return{mode:'RANGE',start:new Date(`${startDate}T00:00:00`),end:new Date(`${endDate}T23:59:59.999`)};const year=Number(yearValue),month=Number(monthValue);if(!year)return{mode:'ALL',start:null,end:null};if(!month)return{mode:'YEAR',start:new Date(year,0,1),end:new Date(year,11,31,23,59,59,999)};return{mode:'MONTH',start:new Date(year,month-1,1),end:new Date(year,month,0,23,59,59,999)};}
    inScope(date,scope){return scope.mode==='ALL'||(date instanceof Date&&date>=scope.start&&date<=scope.end);}
    previousPeriod(period){const[year,month]=period.split('-').map(Number),date=new Date(year,month-2,1);return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;}
    reset(){this.document.querySelectorAll('.filters select, .filters input').forEach(element=>{element.value='';});this.byId('fYear').value=String(this.defaultYear());this.syncYearMonth();}
  };
})();
