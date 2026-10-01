// Visual/asset tests deliberately load all optional scenery, and wait, as a flight does, for
// its preparation behind the menu (the warm-up would otherwise compete with their screenshots).
// Functional tests keep the real flight deck but avoid unrelated terrain downloads and captures.
export async function completeScenery(page) {
  await page.evaluate(async()=>{
    const s=window.__sim;s.setDrawing(false);
    await s.world.assetsReady;await s.world.prepareScenery();
  });
}

export async function functionalScene(page) {
  await page.addInitScript(()=>window.addEventListener('sim-ready',()=>{
    const s=window.__sim,w=s.world;s.setDrawing(false);
    const load=w.loadScenery.bind(w),update=w.cabinEnvironment.update.bind(w.cabinEnvironment),warm=w.warmUp.bind(w);
    w.loadScenery=async()=>{};w.cabinEnvironment.update=()=>{};w.warmUp=async()=>{};
    window.__restoreVisualScene=async()=>{
      w.loadScenery=load;w.cabinEnvironment.update=update;w.warmUp=warm;
      await load();await w.loadNearTrees?.();
    };
  },{once:true}));
}
