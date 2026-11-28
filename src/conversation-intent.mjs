import {parseDecisionChange,hasDecisionValue} from './decision-schema.mjs';

const escapeRE=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const fieldNames=field=>[...new Set([field.label,field.conditionLabel,field.label.replace(/\s*[(（][^()（）]*[)）]\s*$/,''),...(field.aliases||[])].filter(Boolean))];
export function mentionedFields(message,schema){
  return schema.fields.filter(field=>fieldNames(field).some(name=>new RegExp(escapeRE(name),'i').test(message))).map(field=>field.key);
}
export const isExplanation=message=>(/(?:怎么选|如何选|推荐哪|哪[个些一].{0,16}更(?:合适|适合))/.test(message)&&!/(?:改到|改为|改成|设为|调整到)/.test(message))||/^(?:为什么|为何|怎么|请解释|解释|哪些|哪[一几]个)/.test(message)||/(?:不要|别|先不|暂不|不必)(?:进行)?(?:改|修改|调整|改变|改动)(?:动)?(?:任何)?(?:条件|设置|筛选|参数|要求)/.test(message)||/^(?:我(?:只是|只)?(?:想|想要)?(?:了解|问|知道)|你觉得|你认为|能否解释|可以解释|请问).*(?:合不合适|会不会|是否|是不是|为什么|怎么样|合理|偏高|太低|太高|合适)/.test(message);
export const isUndo=message=>/^(?:请|帮我)?(?:撤销(?:这次|上次|刚才的?)?(?:修改|操作|变化)?|还是刚才那样|恢复(?:到)?(?:刚才|上一步|修改前)(?:那样|的条件)?)[吧呢了。！!？?\s]*$/.test(message);
const clearRequest=message=>!/(?:不要|别|不想|无需|先不|不)\s*(?:取消|清空|去掉|移除)/.test(message)&&/(?:不再限制|不限制|不限|没有(?:什么|任何)?要求|没要求|无要求|取消|清空|去掉|移除|不考虑|不用考虑|不管|不设上限)/.test(message);
const clearParts=message=>message.split(/[，,。；;]/).flatMap(part=>part.split(/但是|但|同时|并且|而且|(?=保留|保持)/)).filter(clearRequest);
const allRequest=message=>/(?:全部|所有|任何|都不|都没|全都)/.test(message);

export function focusedFields(space,selected,input){
  const keys=new Set(space.schema.fields.map(field=>field.key));
  if(keys.has(input.focusField))return [input.focusField];
  const focus=space.conversationState?.focus;
  if(focus?.scenarioId===selected.id)return (focus.fields||[]).filter(key=>keys.has(key));
  const recent=[...(space.conversation||[])].reverse().find(message=>message.role==='assistant'&&message.scenarioId===selected.id&&message.changedFields?.length);
  return (recent?.changedFields||[]).filter(key=>keys.has(key));
}

// Resolve only references backed by the current field/schema or an outstanding
// question. Arbitrary historical numbers never become new user constraints.
export function resolveConversationIntent(space,selected,input){
  const message=input.message.trim(),schema=space.schema,focus=focusedFields(space,selected,input),mentioned=mentionedFields(message,schema);
  const pending=space.conversationState?.pending;
  if(input.choiceId||input.clarificationId){
    if(!pending||pending.id!==input.clarificationId||pending.scenarioId!==selected.id)throw new Error('这个问题已失效，请在当前路径重新说明想调整的条件');
    const choice=pending.options.find(option=>option.id===input.choiceId);
    if(!choice)throw new Error('请选择当前问题中的选项');
    return {kind:'change',operations:choice.operations,focus:choice.operations.map(operation=>operation.field),answered:choice.label,pendingId:pending.id};
  }
  if(pending?.scenarioId===selected.id){
    const ordinal=/^(?:选|选择|就|那就|就按)?\s*(?:第?([一二三四五六七八九]|[1-9])(?:个|项|种)?)[吧。！!\s]*$/.exec(message);
    const index=ordinal?'一二三四五六七八九'.indexOf(ordinal[1])>=0?'一二三四五六七八九'.indexOf(ordinal[1]):Number(ordinal[1])-1:-1;
    const choice=pending.options[index]||pending.options.find(option=>option.label===message.replace(/[吧呢。？！!?]+$/,''));
    if(choice)return {kind:'change',operations:choice.operations,focus:choice.operations.map(operation=>operation.field),answered:choice.label,pendingId:pending.id};
    if(ordinal)return {kind:'clarify',question:'请从这个问题已有的选项中选择。'+pending.question,options:pending.options,focus};
  }
  if(/^(?:不用了|算了|先不改了|不改了|保持原样|不取消了|先不取消|取消这次操作|不要改了|没有其他要求|没其他要求)[吧呢。！!？?\s]*$/.test(message))return {kind:'dismiss',focus};
  if(isUndo(message)||input.undoActionId)return {kind:'undo',focus};
  if(isExplanation(message))return {kind:'explain',focus:mentioned.length?mentioned:focus};
  const parsed=parseDecisionChange(message,selected.settings,schema);
  // Scalar conditions cannot represent both interval endpoints. Keep the turn
  // atomic instead of silently choosing one endpoint or applying other fields.
  if(parsed.ranges.length){
    const field=schema.fields.find(field=>field.key===parsed.ranges[0].field);
    return {kind:'range',parsed,focus:[field.key]};
  }
  const clearing=clearParts(message),clearMentioned=[...new Set(clearing.flatMap(part=>mentionedFields(part,schema)))],clearAll=clearing.some(allRequest);
  if(clearing.length){
    const fields=clearAll?schema.fields.map(field=>field.key):clearMentioned.length?clearMentioned:focus;
    if(!fields.length||(!clearAll&&!clearMentioned.length&&fields.length>1)){
      const choices=schema.fields.filter(field=>selected.settings.limits[field.key]!==null);
      return {kind:'clarify',question:'你想取消哪部分要求？',options:[...choices.map(field=>({id:'clear-'+field.key,label:'只取消'+(field.conditionLabel||field.label)+'限制',operations:[{type:'clear',field:field.key}]})),{id:'clear-all',label:'取消全部筛选条件',operations:schema.fields.map(field=>({type:'clear',field:field.key}))}],focus};
    }
    // A mixed turn may both remove a requirement and set a different value.
    const operations=[...fields.map(field=>({type:'clear',field})),...parsed.specified.filter(field=>!fields.includes(field)).map(field=>({type:'set',field,value:parsed.settings.limits[field],quote:message}))];
    return {kind:'change',operations,focus:[...new Set(operations.map(operation=>operation.field))]};
  }
  if(parsed.specified.length)return {kind:'change',operations:parsed.specified.map(field=>({type:parsed.settings.limits[field]===null?'clear':'set',field,value:parsed.settings.limits[field],quote:message})),focus:parsed.specified};
  // Categorical short replies carry their own typed value just as "32G呢"
  // does. Resolve an exact schema option before asking the model for prose.
  const categorical=message.split(/[，,。；;]/).at(-1).replace(/\s/g,'');
  const matches=schema.fields.filter(field=>field.type==='enum').flatMap(field=>field.options.filter(value=>new RegExp('^(?:(?:那|如果|我想要|我|请|先|就|仍然|还是|要|用|只看|选择|改回|改成|改为|恢复到)){0,6}'+escapeRE(value.replace(/\s/g,''))+'[吧呢了?？。！!]*$').test(categorical)).map(value=>({field:field.key,value})));
  const focused=matches.filter(match=>focus.includes(match.field)),options=focused.length?focused:matches;
  if(options.length===1)return {kind:'change',operations:[{type:'set',...options[0],quote:message}],focus:[options[0].field]};
  if(options.length>1)return {kind:'clarify',question:'这个选项要用于哪个条件？',options:options.map((option,i)=>({id:'category-'+i,label:'调整'+(schema.fields.find(f=>f.key===option.field).conditionLabel||option.field),operations:[{type:'set',...option,quote:message}]})),focus};
  const correction=/(?:还是(?:要|用|改成)?|改回|恢复到|我要|我想要|应该是|准确说是)\s*(\d[\d,.，]*\s*(?:GB|G|TB|kg|千克|公斤|克|元|分钟|小时|㎡|平米|平方米)?)/ig;
  const corrected=[...message.matchAll(correction)].at(-1);
  const short=/^(?:(?:那|如果)\s*)?(?:改成|改为|调整到|设为|至少|最多|不超过|增加|减少|再增加|再减少|再加|再减)?\s*\d[\d,.，]*\s*(?:GB|G|TB|kg|千克|公斤|克|元|分钟|小时|㎡|平米|平方米)?\s*(?:呢|吧|试试|怎么样|以内|以下|以上)?[?？。！!\s]*$/i.test(message);
  if(short||corrected){
    const valueRequest=corrected?corrected[1]:message.replace(/^(?:那|如果)/,'');
    const unit=/\d\s*(GB|G|TB|kg|千克|公斤|克|元|分钟|小时|㎡|平米|平方米)/i.exec(valueRequest)?.[1];
    const matching=unit?schema.fields.filter(field=>new RegExp('^(?:'+escapeRE(unit==='G'?'GB':unit)+')$','i').test(field.unit)):[];
    const fields=matching.length===1?[matching[0].key]:focus;
    if(fields.length===1){
      const field=schema.fields.find(field=>field.key===fields[0]);
      const inferred=parseDecisionChange(field.conditionLabel+valueRequest.replace(/(\d)G\b/ig,'$1GB'),selected.settings,schema);
      if(inferred.specified.length)return {kind:'change',operations:inferred.specified.map(key=>({type:'set',field:key,value:inferred.settings.limits[key],quote:message})),focus:fields};
    }
    const options=schema.fields.filter(field=>(field.type||'number')==='number').flatMap(field=>{
      try{const inferred=parseDecisionChange(field.conditionLabel+valueRequest,selected.settings,schema);return inferred.specified.length?[{id:'set-'+field.key,label:'调整'+(field.conditionLabel||field.label),operations:[{type:'set',field:field.key,value:inferred.settings.limits[field.key],quote:message}]}]:[];}catch{return [];}
    });
    return {kind:'clarify',question:'这个数值要用在哪个条件上？',options,focus};
  }
  return {kind:'model',focus:mentioned.length?mentioned:focus};
}

export function validatedModelOperations(answer,message,schema,selected,focus){
  if(isExplanation(message))return [];
  const mentioned=mentionedFields(message,schema),parsed=parseDecisionChange(message,selected.settings,schema);
  const operations=Array.isArray(answer.operations)?answer.operations:(answer.changes||[]).map(change=>({...change,type:change.value===null?'clear':'set'}));
  return operations.slice(0,8).filter(operation=>{
    const field=schema.fields.find(field=>field.key===operation.field);
    if(!field)return false;
    const semanticTarget=answer.intent==='change'&&typeof operation.quote==='string'&&operation.quote.length>1&&message.includes(operation.quote)&&/(?:改|调整|提高|降低|至少|以内|不超过|取消|不限|无所谓|增加|减少|放宽|收紧|设为|变成)/.test(message);
    if(!mentioned.includes(field.key)&&!focus.includes(field.key)&&!semanticTarget)return false;
    if(operation.type==='clear'){
      const clearing=clearParts(message),named=clearing.flatMap(part=>mentionedFields(part,schema));
      if(clearing.some(allRequest)||named.includes(field.key)||clearing.length>0&&!named.length&&focus.includes(field.key))return true;
      // Semantic phrases such as “价格无所谓” are interpreted by the model.
      // Still require a verbatim request, a known target, and no negated removal.
      return answer.intent==='change'&&typeof operation.quote==='string'&&operation.quote.length>1&&message.includes(operation.quote)&&!/(?:不要|别|不想|不|保留|保持).{0,6}(?:取消|清空|去掉|移除|限制)/.test(message);
    }
    if(operation.type!=='set'||!hasDecisionValue(operation.value,field))return false;
    const quote=operation.quote;
    if(typeof quote!=='string'||!quote||!message.includes(quote))return false;
    return (field.type||'number')!=='number'||quote.replaceAll(',','').includes(String(operation.value))||parsed.specified.includes(field.key)&&parsed.settings.limits[field.key]===operation.value;
  });
}

export function modelClarification(answer,schema,settings,message){
  const raw=answer.clarification;
  if(!raw||typeof raw.question!=='string'||!raw.question.trim()||raw.question.length>600||!Array.isArray(raw.options))return null;
  const options=raw.options.slice(0,9).flatMap((option,index)=>{
    if(!Array.isArray(option.operations)||!option.operations.length||option.operations.length>8)return [];
    const operations=option.operations;
    for(const operation of operations){
      const field=schema.fields.find(field=>field.key===operation.field);
      if(!field||!['set','clear'].includes(operation.type))return [];
      if(operation.type==='set'&&(!hasDecisionValue(operation.value,field)||typeof operation.quote!=='string'||!message.includes(operation.quote)||(field.type||'number')==='number'&&!operation.quote.replaceAll(',','').includes(String(operation.value))))return [];
    }
    // Derive the label from the proposed operation, so the selected button
    // cannot promise a different effect from the operation it will execute.
    const label=operations.map(operation=>{const field=schema.fields.find(field=>field.key===operation.field);return operation.type==='clear'?'取消'+field.conditionLabel+'限制':field.conditionLabel+'改为'+String(operation.value)+field.unit;}).join('，');
    try{const candidate=structuredClone(settings);for(const operation of operations)candidate.limits[operation.field]=operation.type==='clear'?null:operation.value;parseDecisionChange('',candidate,schema);}catch{return [];}
    return [{id:'model-choice-'+index,label,operations}];
  });
  return options.length?{question:raw.question,options}:null;
}
