// Exercise the actual auth restore logic and account scope with controlled hook
// dependencies. These are component contract checks, not device UI tests.
const fs = require('node:fs'); const Module = require('node:module');
const babel = require('@babel/core'); const assert = require('node:assert/strict');
const React = require('react'); const load = Module._load;
for (const ext of ['.ts','.tsx']) Module._extensions[ext]=(mod,file)=>mod._compile(babel.transformSync(fs.readFileSync(file,'utf8'),{
  filename:file,babelrc:false,configFile:false,presets:['@babel/preset-typescript',['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs'],
}).code,file);
let identity=null; let restore; let authCallback; const effects=[]; const states=[];
let stateIndex=0;
const hooks={...React,useState(value){const i=stateIndex++;states[i]=value;return [value,next=>{states[i]=next;}];},
  useEffect(effect){effects.push(effect);},useMemo:fn=>fn()};
const client={auth:{getSession:()=>new Promise(resolve=>{restore=resolve;}),onAuthStateChange(callback){authCallback=callback;return {data:{subscription:{unsubscribe(){}}}};}}};
Module._load=function(request,parent){
  if(parent.filename.endsWith('AccountScope.tsx')){
    if(request==='./AuthProvider')return {useAuth:()=>({user:identity})};
    if(request==='./ClashStore')return {ClashProvider:()=>null};
  }
  if(parent.filename.endsWith('AuthProvider.tsx')){
    if(request==='react')return hooks;
    if(request==='../services/supabaseClient')return {isLocalSupabase:true,supabase:client};
    if(request==='../services/authService')return {};
  }
  return load.apply(this,arguments);
};
async function main(){
  const {AccountScope}=require('../store/AccountScope.tsx');
  const guest=AccountScope({children:null});identity={id:'account-a'};const a=AccountScope({children:null});
  identity={id:'account-b'};const b=AccountScope({children:null});
  assert.notEqual(guest.key,a.key);assert.notEqual(a.key,b.key);
  assert.equal(AccountScope({children:null}).key,b.key,'same account keeps its scope');
  identity=null;assert.equal(AccountScope({children:null}).key,guest.key);
  console.log('PASS sign-in, account switch and sign-out replace the shared store/screen scope');
  const {AuthProvider}=require('../store/AuthProvider.tsx');AuthProvider({children:null});
  const cleanup=effects[0]();authCallback('SIGNED_IN',{user:{id:'account-b'}});
  restore({data:{session:{user:{id:'account-a'}}}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(states[0].user.id,'account-b','late persisted session cannot overwrite newer auth event');
  cleanup();authCallback('SIGNED_IN',{user:{id:'disposed'}});assert.equal(states[0].user.id,'account-b');
  console.log('PASS stale auth restoration and callbacks from disposed providers cannot overwrite identity');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
