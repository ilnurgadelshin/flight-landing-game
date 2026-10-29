// One place for how the browser tests launch Chromium.
//
// VISUAL_GPU picks the ANGLE backend: swiftshader (software rendering, the default; it
// works on any machine) or metal (hardware, on macOS). Software rendering is several
// times slower than a GPU, and its speed varies with the machine's load, so:
//  - waits stretch with it: scaledTimeout(ms) for explicit waits, and every page's
//    default action/screenshot timeout (TEST_TIMEOUT_SCALE overrides the factor);
//  - suites that check placement, counts and sample points rather than fine pixels can
//    ask for lowResolution: the 3D view then draws at RENDER_SCALE (default 0.5) of its
//    pixel ratio. Page size, layout and screenshot dimensions are unchanged.
// TEST_PROFILE=1 logs every page call that takes a second or more, to find slow steps.
import {chromium} from 'playwright';

let backend=process.env.VISUAL_GPU||'swiftshader';
const software=()=>backend==='swiftshader';
const factor=()=>Number(process.env.TEST_TIMEOUT_SCALE)||(software()?3:1);

/** A wait sized for hardware rendering, stretched for software rendering. */
export const scaledTimeout=ms=>Math.round(ms*factor());

const PROFILED=['goto','reload','waitForFunction','evaluate','screenshot','waitForEvent'];
const prepared=new WeakSet();

function preparePage(page,{lowResolution}){
  // browser.newPage() opens its page through browser.newContext(): prepare each page once.
  if(prepared.has(page))return;prepared.add(page);
  // Playwright's 30 s default is tuned for a GPU: one software-rendered frame of the full
  // scenery can take longer on a busy machine.
  if(software())page.setDefaultTimeout(scaledTimeout(60000));
  if(process.env.TEST_PROFILE)for(const name of PROFILED){
    const call=page[name].bind(page);
    page[name]=async(...args)=>{
      const start=Date.now();
      try{return await call(...args);}
      finally{const s=(Date.now()-start)/1000;if(s>=1)console.error(`[profile] ${name} ${s.toFixed(1)} s`);}
    };
  }
  const scale=Number(process.env.RENDER_SCALE||.5);
  // Scale the renderer's own setter: the game and its resolution controller keep their
  // logical pixel ratio (world.pixelRatio), so nothing compounds the factor.
  if(lowResolution&&software()&&scale>0&&scale<1)return page.addInitScript(scale=>{
    addEventListener('sim-ready',()=>{
      const world=window.__sim?.world,renderer=world?.renderer;if(!renderer||renderer.renderScale)return;
      const set=renderer.setPixelRatio.bind(renderer);renderer.renderScale=scale;
      renderer.setPixelRatio=ratio=>set(ratio*scale);
      world.setPixelRatio(world.pixelRatio);
    },{once:true});
  },scale);
}

/**
 * Launch headless Chromium for WebGL tests.
 * @param {{defaultAngle?:string,args?:string[],lowResolution?:boolean}} options
 *  defaultAngle: the backend when VISUAL_GPU is unset (a few review tools default to metal);
 *  args: extra Chromium switches; lowResolution: draw the 3D view at RENDER_SCALE under
 *  software rendering, for every page this browser opens.
 */
export async function launchBrowser({defaultAngle='swiftshader',args=[],lowResolution=false}={}){
  backend=process.env.VISUAL_GPU||defaultAngle;
  const browser=await chromium.launch({headless:true,args:[`--use-angle=${backend}`,
    ...(software()?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[]),...args]});
  const newPage=browser.newPage.bind(browser),newContext=browser.newContext.bind(browser);
  browser.newPage=async options=>{const page=await newPage(options);await preparePage(page,{lowResolution});return page;};
  browser.newContext=async options=>{
    const context=await newContext(options),contextPage=context.newPage.bind(context);
    context.newPage=async()=>{const page=await contextPage();await preparePage(page,{lowResolution});return page;};
    return context;
  };
  return browser;
}
