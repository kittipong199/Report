/* Promise-based Excel ingestion pipeline with Data/ and embedded fallbacks. */
(() => {
  'use strict';
  const OOP=(window.AVEVA_OOP=window.AVEVA_OOP||{});
  OOP.DataLoadError=class DataLoadError extends Error{constructor(message,options={}){super(message,options);this.name='DataLoadError';}};
  OOP.ExcelLoader=class ExcelLoader{
    constructor({repository,mapper,loadingView,config,utils,onDataLoaded=null,xlsx=window.XLSX}){
      Object.assign(this,{repository,mapper,loadingView,config,utils,onDataLoaded,xlsx});
    }
    status(message){const target=document.getElementById('status');if(target)target.textContent=message;}
    matchFiles(files){const matched={};for(const file of files){for(const[key,pattern]of Object.entries(this.config.filePatterns)){if(pattern.test(file.name)){if(matched[key])throw new Error(`Duplicate ${key} files: ${matched[key].name} | ${file.name}`);matched[key]=file;}}}return matched;}
    validateFiles(matched){const missing=this.config.requiredFileKeys.filter(key=>!matched[key]);if(missing.length)throw new Error(`Missing files: ${missing.join(', ')}`);}
    async fetchSourceFile(path){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error(`${response.status} ${path}`);const blob=await response.blob();return new File([blob],decodeURIComponent(path.split('/').pop()),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
    getEmbeddedFiles(){const entries=window.AVEVA_EMBEDDED_DATA?.files;if(!Array.isArray(entries)||!entries.length)return[];return entries.map(({name,base64})=>{const binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);return new File([bytes],name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});});}
    async autoLoad(){
      const forceEmbedded=new URLSearchParams(location.search).get('dataSource')==='embedded';
      if(location.protocol==='file:'||forceEmbedded)return this.load(this.getEmbeddedFiles(),'AUTO EMBEDDED');
      const files=[];
      for(const[key,candidates]of Object.entries(this.config.sourcePaths)){let loaded=null;for(const candidate of candidates){try{loaded=await this.fetchSourceFile(candidate);break;}catch(error){console.debug(`[AVEVA] Auto source candidate unavailable (${key})`,error);}}if(loaded)files.push(loaded);else if(this.config.requiredFileKeys.includes(key))break;}
      const matched=this.matchFiles(files);if(this.config.requiredFileKeys.some(key=>!matched[key]))return this.load(this.getEmbeddedFiles(),'AUTO EMBEDDED');
      return this.load(files,'AUTO /Data/');
    }
    async load(files,sourceLabel='MANUAL'){
      this.loadingView?.show('Loading Excel data…');this.status(`${this.config.buildId} | Loading Excel data…`);
      try{const matched=this.matchFiles(Array.from(files||[]));this.validateFiles(matched);const workbooks=await this.readWorkbooks(matched);const normalized=await this.processWorkbooks(workbooks,matched);this.repository.replaceData(normalized);await this.onDataLoaded?.(this.repository);this.updateLoadedStatus(sourceLabel);return this.repository.state.data;}
      catch(error){throw new OOP.DataLoadError(`Failed to load AVEVA source data: ${error.message}`,{cause:error});}
      finally{this.loadingView?.hide();}
    }
    async loadFiles(files){return this.load(files,'MANUAL');}
    async readWorkbook(file){return this.xlsx.read(await file.arrayBuffer(),{type:'array',cellDates:false});}
    async readWorkbooks(matched){const[credit2025,credit2026,usage2025,usage2026,mapping,burndown]=await Promise.all([this.readWorkbook(matched.credit2025),this.readWorkbook(matched.credit2026),this.readWorkbook(matched.usage2025),this.readWorkbook(matched.usage2026),this.readWorkbook(matched.mapping),matched.burndown?this.readWorkbook(matched.burndown):Promise.resolve(null)]);return{credit2025,credit2026,usage2025,usage2026,mapping,burndown};}
    readRows(workbook,sheetName){return this.xlsx.utils.sheet_to_json(workbook.Sheets[sheetName],{defval:'',raw:true});}
    findSheet(workbook,expectedNames){for(const expected of expectedNames){const found=workbook.SheetNames.find(name=>this.utils.normalize(name)===this.utils.normalize(expected));if(found)return found;}return null;}
    findPeriodSheets(workbook,type,year){const prefix=type==='credit'?`credittransactions${year}-`:`sourceuserusage${year}`,pattern=new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\((\\d{1,2})-(\\d{1,2})\\)$`);return workbook.SheetNames.map(sheetName=>{const match=this.utils.normalize(sheetName).match(pattern);if(!match)return null;const startMonth=Number(match[1]),endMonth=Number(match[2]);return startMonth>=1&&startMonth<=12&&endMonth>=1&&endMonth<=12&&startMonth<=endMonth?{sheetName,startMonth,endMonth}:null;}).filter(Boolean).sort((a,b)=>a.startMonth-b.startMonth||a.endMonth-b.endMonth).map(item=>item.sheetName);}
    validateSheets(workbooks,sheets){const errors=[];for(const[key,label]of [['credit2025','Credit 2025'],['credit2026','Credit 2026'],['usage2025','Usage 2025'],['usage2026','Usage 2026']])if(!sheets[key].length)errors.push(`${label}: expected monthly period sheet was not found | Available: ${workbooks[key].SheetNames.join(' | ')}`);if(!sheets.mappingUser)errors.push(`AVEVA Mapping: required sheet "name AD" was not found | Available: ${workbooks.mapping.SheetNames.join(' | ')}`);if(errors.length)throw new Error(`${this.config.buildId} | V17 Sheet validation failed | ${errors.join(' || ')}`);}
    async processWorkbooks(workbooks,matched){
      const sheets={credit2025:this.findPeriodSheets(workbooks.credit2025,'credit',2025),credit2026:this.findPeriodSheets(workbooks.credit2026,'credit',2026),usage2025:this.findPeriodSheets(workbooks.usage2025,'usage',2025),usage2026:this.findPeriodSheets(workbooks.usage2026,'usage',2026),mappingUser:this.findSheet(workbooks.mapping,['name AD']),mappingPlan:this.findSheet(workbooks.mapping,['Plan Hour']),mappingEngineer:this.findSheet(workbooks.mapping,['H_Employee'])};this.validateSheets(workbooks,sheets);
      const tx=[];let offset=0;for(const[workbook,key]of [[workbooks.credit2025,'credit2025'],[workbooks.credit2026,'credit2026']])for(const sheet of sheets[key]){const mapped=this.mapper.mapTransactions(this.readRows(workbook,sheet),matched[key].name,sheet,offset);tx.push(...mapped);offset+=mapped.length;}
      const usage=[...sheets.usage2025.flatMap(sheet=>this.mapper.mapUsage(this.readRows(workbooks.usage2025,sheet),matched.usage2025.name)),...sheets.usage2026.flatMap(sheet=>this.mapper.mapUsage(this.readRows(workbooks.usage2026,sheet),matched.usage2026.name))];
      const employees=this.mapper.mapEmployees(this.readRows(workbooks.mapping,sheets.mappingUser));
      const planHours=sheets.mappingPlan?this.mapper.mapPlanHours(this.readRows(workbooks.mapping,sheets.mappingPlan)):[];
      const engineerHours=sheets.mappingEngineer?this.mapper.mapEngineerHours(this.readRows(workbooks.mapping,sheets.mappingEngineer)):[];
      let burndown=[];if(workbooks.burndown){const rows=this.readRows(workbooks.burndown,workbooks.burndown.SheetNames[0]),required=['Date','Service / Transaction','Units','Description','Value','Balance'],columns=new Set(Object.keys(rows[0]||{})),missing=required.filter(column=>!columns.has(column));if(missing.length)throw new Error(`Invalid Burndown Excel: missing column '${missing.join("', '")}'`);burndown=this.mapper.mapBurndown(rows,matched.burndown.name);}
      return{usage,tx,employees,planHours,engineerHours,burndown,viewUsage:[]};
    }
    updateLoadedStatus(sourceLabel){const data=this.repository.state.data;this.status(`${sourceLabel} | ${this.config.buildId} | Loaded: Usage ${data.usage.length.toLocaleString()} | Transactions ${data.tx.length.toLocaleString()} | AVEVA Users ${data.employees.length.toLocaleString()} | Plan Hours ${data.planHours.reduce((sum,row)=>sum+(Number(row.hours)||0),0).toLocaleString()} | Engineer Resources ${data.engineerHours.length.toLocaleString()} | Burndown ${data.burndown.length.toLocaleString()}`);}
  };
})();
