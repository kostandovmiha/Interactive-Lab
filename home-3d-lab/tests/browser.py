"""Local browser checks; mocked Auth/Storage are NOT live Supabase/Google tests."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import json
import os
import shutil
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(REPO), **kwargs)
    def translate_path(self, path): return super().translate_path(path.removeprefix('/Interactive-Lab'))
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/Interactive-Lab/'
config = "export default {supabaseUrl:'https://testproject.supabase.co',supabasePublishableKey:'sb_publishable_TESTONLY',maxModelBytes:10485760,groups:{roof:['roof'],floors:['floor'],walls:['wall'],doors:['door'],windows:['window'],furniture:['furniture']}};"
SDK = """
export function createClient() {
 globalThis.__allowed = ALLOWED; globalThis.__signedIn = SIGNEDIN;
 const user={id:'11111111-1111-4111-8111-111111111111'};
 const session=()=>globalThis.__signedIn?{user,access_token:'test-token'}:null;
 return {
  auth:{getSession:async()=>({data:{session:session()}}),getUser:async()=>({data:{user:session()?user:null}}),
   signInWithOAuth:async options=>{globalThis.__oauthOptions=options;return {};},
   signOut:async()=>{globalThis.__signedIn=false;globalThis.__authCallback?.('SIGNED_OUT');return {};},
   onAuthStateChange:cb=>{globalThis.__authCallback=cb;return {data:{subscription:{unsubscribe(){}}}};}},
  from:table=>({select(){return this;},eq(){return this;},
    maybeSingle:async()=>({data:globalThis.__allowed?{user_id:user.id}:null}),
    order:async()=>({data:MODELS})})
 };
}
"""

def mock(context, allowed=True, signed=True, models=None):
    context.route('**/home-3d-lab/config.js', lambda route: route.fulfill(body=config, content_type='text/javascript'))
    context.route('**/@supabase/supabase-js@2.57.4/+esm', lambda route: route.fulfill(body=SDK.replace('ALLOWED',json.dumps(allowed)).replace('SIGNEDIN',json.dumps(signed)).replace('MODELS',json.dumps(models or [])), content_type='text/javascript'))

try:
 with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HOME3D_CHROMIUM') or shutil.which('chromium'), headless=True, args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width':1280,'height':900})
    # Missing-config coverage must not depend on deployment config being empty.
    page.route('**/home-3d-lab/config.js', lambda route: route.fulfill(body='export default {};', content_type='text/javascript'))
    errors = []
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(base+'home-3d-lab/',wait_until='networkidle')
    assert 'Налаштування відсутні' in page.locator('#gate-detail').inner_text()
    assert page.locator('#load-model').is_disabled() and page.locator('canvas').count()==0
    print('PASS: subpath + missing configuration fail closed',flush=True)
    for path in ['', 'kids-games/', 'kids-games/train.html', 'learning-lab/', 'learning-lab/workspace.html?project=copernicus', 'voice-lab/', 'ship-lab/']:
        response=page.goto(base+path,wait_until='networkidle')
        assert response.status==200
        if path=='ship-lab/': assert page.locator('canvas').count()==1
    assert not errors, errors
    print('PASS: 7 existing pages including Ship WebGL, no uncaught JS errors',flush=True)
    page.goto(base+'home-3d-lab/',wait_until='networkidle')
    # Test model/physics modules via public source, without adding a production auth bypass.
    result=page.evaluate("""async () => {
      const THREE=await import('three');
      const {createDemo}=await import('./js/demo.js');
      const {prepareModel,parseModel,disposeModel}=await import('./js/model.js');
      const {WalkPhysics,EYE_HEIGHT}=await import('./js/walkthrough.js');
      const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
      const model=prepareModel(createDemo()); const physics=new WalkPhysics(model);
      // Move west into a perimeter wall for 4 seconds at maximum speed.
      for(let i=0;i<240;i++) physics.step(1/60,new THREE.Vector3(-1,0,0),5);
      const west=physics.eyePosition();
      if(west.x < -3.71 || west.x > -3.5) throw Error('Wall collision failed '+west.x);
      if(Math.abs(west.y-EYE_HEIGHT)>.06) throw Error('Floor/gravity failed '+west.y);
      physics.reset();
      // Through a doorway between rooms at z=-2, then stop against the east wall.
      for(let i=0;i<80;i++) physics.step(1/60,new THREE.Vector3(1,0,0),2);
      const doorway=physics.eyePosition(); if(doorway.x < .4) throw Error('Doorway blocked '+doorway.x);
      physics.reset();
      for(let i=0;i<80;i++) physics.step(1/60,new THREE.Vector3(0,0,1),2);
      for(let i=0;i<180;i++) physics.step(1/60,new THREE.Vector3(1,0,0),2);
      if(physics.eyePosition().x > -.28) throw Error('Partition collision failed');
      // Self-contained GLB with hierarchy, name, rotation and nonuniform scale.
      const source=new THREE.Group();source.name='SourceRoot';source.position.set(3,1,0);
      const child=new THREE.Group();child.name='Interior_Group';child.position.set(2,0,1);child.rotation.y=.4;source.add(child);
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial({color:0xabcdef}));mesh.name='Furniture_Table';mesh.scale.set(2,1,.5);child.add(mesh);source.updateMatrixWorld(true);
      const before=mesh.getWorldPosition(new THREE.Vector3());
      const binary=await new GLTFExporter().parseAsync(source,{binary:true});
      const parsed=await parseModel(binary);const found=parsed.getObjectByName('Furniture_Table');parsed.updateMatrixWorld(true);
      if(!found || !parsed.getObjectByName('Interior_Group')) throw Error('Hierarchy/name lost');
      if(found.getWorldPosition(new THREE.Vector3()).distanceTo(before)>1e-6 || Math.abs(found.scale.x-2)>1e-6) throw Error('Transforms lost');
      const wrapped=prepareModel(parsed,{origin:[10,0,0],rotationDegrees:[0,90,0],scale:2});
      const expected=before.clone().multiplyScalar(2).applyAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2).add(new THREE.Vector3(10,0,0));
      if(found.getWorldPosition(new THREE.Vector3()).distanceTo(expected)>1e-5) throw Error('Wrapper transform failed');
      let disposed=0; found.geometry.addEventListener('dispose',()=>disposed++);disposeModel(wrapped.root);
      if(disposed!==1) throw Error('Geometry not disposed');
      disposeModel(source);disposeModel(model.root);
      return {wallX:west.x,eyeHeight:west.y,doorwayX:doorway.x,glbBytes:binary.byteLength,glbBase64:btoa(String.fromCharCode(...new Uint8Array(binary)))};
    }""")
    print('PASS: physics + GLB hierarchy/transforms/disposal',{k:v for k,v in result.items() if k!='glbBase64'},flush=True)
    assert page.evaluate("async()=>typeof (await import('@supabase/supabase-js')).createClient")== 'function'
    print('PASS: pinned real Supabase SDK imports under CSP',flush=True)
    page.close()
    for allowed,signed in [(False,False),(False,True),(True,True)]:
        context=browser.new_context(viewport={'width':1280,'height':900})
        mock(context,allowed,signed)
        page=context.new_page(); page.on('pageerror',lambda e: errors.append(str(e)))
        storage_requests=[];page.on('request',lambda r: storage_requests.append(r.url) if '/storage/v1/' in r.url else None)
        page.goto(base+'home-3d-lab/',wait_until='networkidle')
        if not allowed:
            assert page.locator('#load-model').is_disabled() and page.locator('canvas').count()==0
            assert not storage_requests
            if signed: assert 'немає дозволу' in page.locator('#gate-detail').inner_text()
            page.click('#login'); assert page.evaluate('globalThis.__oauthOptions.options.redirectTo')==base+'home-3d-lab/'
            print('PASS: mocked anonymous/denied access + OAuth subpath',signed,flush=True)
        else:
            assert page.locator('#auth-state').inner_text()=='Доступ дозволено'
            page.click('#load-model'); page.wait_for_selector('#gate',state='hidden')
            assert page.locator('canvas').count()==1
            assert 'Вигаданий' in page.locator('#scene-label').inner_text()
            assert page.locator('#groups input').count()>=5
            roof=page.locator('#groups label').filter(has_text='Дах');roof.locator('input').uncheck()
            page.mouse.move(450,400);page.mouse.down();page.mouse.move(600,460,steps=8);page.mouse.up();page.mouse.wheel(0,200)
            page.screenshot(path='/tmp/home3d-demo.png')
            page.select_option('#mode','walk');page.click('#enter-walk')
            assert page.evaluate('Boolean(document.pointerLockElement)')
            before=page.locator('canvas').screenshot()
            page.keyboard.down('KeyW');page.wait_for_timeout(500);page.keyboard.up('KeyW')
            after=page.locator('canvas').screenshot(); assert before!=after
            page.keyboard.press('Escape'); page.wait_for_timeout(100)
            assert not page.evaluate('Boolean(document.pointerLockElement)')
            page.select_option('#mode','orbit');page.click('#reset')
            page.click('#logout')
            assert page.locator('#load-model').is_disabled() and not page.locator('#gate').is_hidden()
            print('PASS: mocked allowed viewer, orbit, visibility, pointer lock/WASD/Esc, logout cleanup',flush=True)
        context.close()
    # Complete private loading path with authenticated Storage fixture responses.
    import base64
    catalog=[{'id':'33333333-3333-4333-8333-333333333333','label':'Тестовий приватний GLB','storage_path':'test/fixture.glb','settings':{}}]
    for status in [200,403]:
        context=browser.new_context();mock(context,models=catalog)
        requests=[]
        def storage(route):
            requests.append(route.request)
            assert route.request.headers['authorization']=='Bearer test-token'
            assert route.request.headers['apikey']=='sb_publishable_TESTONLY'
            assert '/object/authenticated/home-3d-private/' in route.request.url
            route.fulfill(status=status,body=base64.b64decode(result['glbBase64']) if status==200 else b'Forbidden',content_type='model/gltf-binary')
        context.route('**/storage/v1/**',storage)
        page=context.new_page();page.goto(base+'home-3d-lab/',wait_until='networkidle')
        page.select_option('#model',catalog[0]['id']);page.click('#load-model')
        if status==200:
            page.wait_for_selector('#gate',state='hidden');assert page.locator('canvas').count()==1
            assert page.locator('#scene-label').inner_text()==catalog[0]['label']
            page.click('#logout');assert not page.locator('#gate').is_hidden()
        else:
            page.wait_for_selector('#error',state='visible');assert page.locator('#load-model').is_disabled()
            assert page.locator('canvas').count()==0
        assert len(requests)==1
        print('PASS: mocked authenticated GLB fetch / fail-closed Storage response',status,flush=True)
        context.close()
    # Logout while a Storage request is in flight must prevent later rendering.
    context=browser.new_context();mock(context,models=catalog);held=[]
    context.route('**/storage/v1/**',lambda route:held.append(route))
    page=context.new_page();page.goto(base+'home-3d-lab/',wait_until='networkidle');page.select_option('#model',catalog[0]['id'])
    with page.expect_request('**/storage/v1/**'):page.click('#load-model')
    page.click('#logout');assert page.locator('#load-model').is_disabled();assert page.locator('canvas').count()==0
    for route in held: route.abort()
    context.close();print('PASS: logout cancels in-flight private download',flush=True)
    context=browser.new_context(viewport={'width':390,'height':844});mock(context)
    mobile=context.new_page(); mobile.goto(base+'home-3d-lab/',wait_until='networkidle');mobile.click('#load-model');mobile.wait_for_selector('#gate',state='hidden')
    assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
    print('PASS: mobile width has no horizontal overflow',flush=True)
    context.close();browser.close()
    assert not errors,errors
finally: server.shutdown()
