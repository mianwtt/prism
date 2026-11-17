import {housingDemo} from './general-space.mjs';
import {decisionScenarios} from './decision-schema.mjs';

// A presentation fixture only; the live agent continues to choose its own schema.
export function rentalShowcase(){
 const space=housingDemo();space.title='租房：省一点租金，还是少一点通勤？';
 const branches=[];
 const add=(id,name,limits,parentScenarioId='scenario-baseline')=>{
  const parent=branches.find(s=>s.id===parentScenarioId),settings=structuredClone(parent?.settings||space.baselineSettings);
  Object.assign(settings.limits,limits);
  branches.push({id,name,parentScenarioId,settings,candidateIds:space.candidates.map(c=>c.id)});
 };
 add('rental-more-budget','每月多 1000 元，能住近一点吗？',{price:5000});
 add('rental-close-work','单程只接受 20 分钟',{commute:20},'rental-more-budget');
 add('rental-longer-commute','愿意通勤 60 分钟，换更大空间',{commute:60});
 add('rental-suburban-space','希望至少 55 平米',{area:55},'rental-longer-commute');
 add('rental-save-rent','把月租控制在 3500 元',{price:3500});
 space.scenarios=decisionScenarios({...space,scenarios:branches});
 space.canvasScenarioIds=branches.map(s=>s.id);space.activeScenarioId='rental-more-budget';
 space.settings=structuredClone(space.scenarios.find(s=>s.id===space.activeScenarioId).settings);
 return space;
}
