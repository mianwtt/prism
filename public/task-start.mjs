const draftKey = 'prism:task-intake:v1';
const limits = {constraints:500, preferences:400, outcome:300};
const fields = [
  ['constraints','哪些条件不能妥协？','预算、时间、地区、规格……请写明具体数值。'],
  ['preferences','更在意什么取舍？','例如更看重稳定性，愿意接受稍高的成本。'],
  ['outcome','建议书重点说明什么？','例如推荐与备选、需要接受的取舍，以及决定前的核对清单。'],
];

export function setupTaskStart() {
  if (location.pathname.startsWith('/classic')) return;
  const welcome = document.getElementById('welcome');
  document.title='Prism — 可验证的方案选型工作台';
  document.querySelector('#new-space span').textContent='新建选型任务';
  welcome.querySelector('.start-heading>span').textContent='开始一次选型研究';
  document.querySelector('#research-button>span').textContent='开始选型研究 ↗';
  welcome.classList.add('task-intake-home');
  const copy = welcome.querySelector('.welcome-copy');
  copy.querySelector('.studio-kicker').innerHTML='<i></i> PRISM / EVIDENCE-BASED SELECTION';
  copy.querySelector('h1').innerHTML='选什么，<br><span>先看清依据与取舍。</span>';
  copy.querySelector('.intro').textContent='提出一个方案选型问题，研究有来源的候选，在画布验证不同条件，最后带走一份决策建议书。';
  copy.querySelector('.hero-principles').innerHTML='<span>有依据的候选</span><span>看得见的取舍</span><span>可带走的建议书</span>';
  const visual = welcome.querySelector('.welcome-visual');
  visual.classList.add('task-method');
  visual.innerHTML='<div class="visual-caption"><span>一个完整的选型任务</span><i></i></div><ol><li><b>01</b><div><strong>研究候选</strong><span>明确需求，检索并核对真实资料</span></div></li><li><b>02</b><div><strong>在画布验证取舍</strong><span>改条件看变化，保留原始情况</span></div></li><li><b>03</b><div><strong>形成决策建议书</strong><span>推荐、备选、证据和待办共同交付</span></div></li></ol><div class="selection-deliverable"><span>最终交付 / SELECTION PROPOSAL</span><strong>决策建议书</strong><div><p><i>01</i>建议选择与主要取舍</p><p><i>02</i>备选方案与条件推演</p><p><i>03</i>引用依据与核对清单</p></div></div><button type="button" class="visual-demo" data-home-demo>先走完一次选型流程 <span>↗</span></button>';
  const form = document.getElementById('research-form');
  const question = document.getElementById('question');
  form.querySelector('label[for=question]').textContent='01 / 你在比较什么，需要满足哪些条件？';
  question.placeholder='例如：为小团队选择一款项目管理工具，需要支持私有部署、任务看板和数据导出，希望维护成本低。';
  welcome.querySelector('.scope-note').textContent='选购、技术方案、工具与服务均可作为选型问题。建议基于实际取得的资料；条件变化可以继续验证，最终选择由你确认。';
  const serviceExample=document.createElement('button');serviceExample.type='button';serviceExample.textContent='工具与服务选型';serviceExample.dataset.exampleQuestion='为三人的 Python 团队比较任务队列方案，需要可自托管、支持失败重试和延迟任务，希望维护成本低；给出资料依据、适用条件和选型建议。';welcome.querySelector('.question-starters').append(serviceExample);
  const details = document.createElement('details');
  details.className = 'task-intake-details';
  details.innerHTML='<summary>补充任务简报 <span>可选，让研究更聚焦</span></summary><div class="task-intake-fields">'+fields.map(([key,label,placeholder],index)=>`<label for="task-${key}"><span>0${index+2} / ${label}</span><textarea id="task-${key}" rows="2" maxlength="${limits[key]}" placeholder="${placeholder}"></textarea></label>`).join('')+'</div>';
  form.querySelector('.research-actions').before(details);
  const status = document.createElement('span');
  status.className='task-draft-status';status.setAttribute('role','status');
  form.querySelector('.research-actions').prepend(status);
  try {
    const raw = JSON.parse(localStorage.getItem(draftKey)||'null');
    if (raw && typeof raw.question==='string' && raw.question.length<=2000) {
      question.value=raw.question;
      for (const [key] of fields) if(typeof raw[key]==='string')document.getElementById('task-'+key).value=raw[key].slice(0,limits[key]);
      details.open=fields.some(([key])=>Boolean(raw[key]));
      status.textContent='已恢复这份任务草稿';
    }
  } catch {}
  form.addEventListener('input',()=>{
    try {
      localStorage.setItem(draftKey,JSON.stringify({question:question.value,...Object.fromEntries(fields.map(([key])=>[key,document.getElementById('task-'+key).value]))}));
      status.textContent='草稿已保存在此浏览器';
    } catch {status.textContent='浏览器未能保存草稿，请保留输入';}
  });
}

export function taskQuestion(question) {
  const additions = fields.flatMap(([key,label])=>{
    const value=document.getElementById('task-'+key)?.value.trim();
    return value ? [`${label}\n${value}`] : [];
  });
  const result = [question.trim(),...additions].join('\n\n');
  if (result.length > 2000) throw new Error('任务简报合计最多 2000 字，请适当精简后再开始研究。');
  return result;
}

export function clearTaskStart() {
  try {localStorage.removeItem(draftKey);} catch {}
}
