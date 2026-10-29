// Yield real browser tasks, not just microtasks, so input and menu paints can run.
// Callers check between small batches; no promises are allocated inside a slice.
// A timer shares the normal task queue with menu progress. Repeated higher-priority
// scheduler continuations can starve those timers even while technically yielding.
export function createWorkSlices({budgetMs=8,now=()=>performance.now(),
 yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
 let start=now();
 const stats={yields:0,maxWorkMs:0,workMs:0};
 const record=()=>{const elapsed=now()-start;stats.maxWorkMs=Math.max(stats.maxWorkMs,elapsed);stats.workMs+=elapsed;};
 return {stats,checkpoint(){
  if(now()-start<budgetMs)return null;
  record();stats.yields++;
  return yieldTask().then(()=>{start=now();});
 },finish(){record();return stats;}};
}
