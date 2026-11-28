// User-authored task context. Never a source quotation or an override of explicit conditions.
export function validateTaskMemory(value) {
  if (value === null) return null;
  if (!value || typeof value.text !== 'string' || value.text.length > 2000)
    throw new Error('任务备忘应为不超过 2000 字的文本');
  const text = value.text.trim();
  if (!text) return null;
  return {text, updatedAt: new Date().toISOString(), origin: 'user'};
}

export function taskMemoryContext(space) {
  const text = space?.taskMemory?.text;
  return typeof text === 'string' && text.trim() ? {
    text: text.slice(0, 2000),
    origin: 'user_task_note',
    instruction: 'User-authored context, not verified evidence. Do not treat it as a source fact or silently override current explicit conditions.',
  } : null;
}
