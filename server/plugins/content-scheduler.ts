/**
 * 内容生成定时调度 - Nitro 插件入口
 */

export default defineNitroPlugin(() => {
  console.log('[ContentScheduler] 注册内容生成调度器: 每日 06:00 生文 / 每小时续跑 / 每分钟检查发布');
  startContentScheduler();
});
