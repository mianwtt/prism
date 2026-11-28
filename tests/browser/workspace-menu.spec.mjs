import {test,expect} from '@playwright/test';

test('the single workspace header keeps original context and settings accessible without duplicate research controls',async({page,request})=>{
 const data=await(await request.post('/api/spaces/demo/housing')).json();
 await page.goto('/#'+data.id);
 const root=page.locator('.universal-root');
 await expect(page.locator('.topbar')).toBeHidden();
 await expect(root.locator('.u-tabs button')).toHaveCount(4);
 await expect(root.locator('.tree-toolbar [data-tree-compose]')).toHaveCount(0);
 await expect(root.locator('.canvas-prompt #conversation-message')).toBeVisible();
 await expect(root.locator('.u-original-question')).toBeHidden();
 await expect(root.locator('.canvas-outcome')).toContainText('月租');
 expect(await root.locator('.flow-viewport').evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('radial-gradient');
 await root.locator('.space-menu>summary').click();await root.locator('.u-original-question>summary').click();
 await expect(root.locator('.u-original-question>p')).toBeVisible();await expect(root.locator('.u-original-question')).toContainText(data.question);
 await page.keyboard.press('Escape');await expect(root.locator('.space-menu')).not.toHaveAttribute('open','');
 await root.locator('.space-menu>summary').click();await root.getByRole('button',{name:'研究设置',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'连接你的研究服务'})).toBeVisible();await page.keyboard.press('Escape');
 await root.getByRole('button',{name:'我的判断',exact:true}).click();
 await expect(root.locator('#u-record')).toBeVisible();await expect(root.locator('.memory-history-grid')).toBeHidden();
 await root.locator('.memory-history>summary').click();await expect(root.locator('.memory-history-grid')).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await root.locator('.space-menu>summary').click();await root.locator('.u-original-question>summary').click();
 await expect(root.locator('.u-original-question>p')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
