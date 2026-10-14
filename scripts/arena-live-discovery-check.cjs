// Actual Live discovery component with controlled server responses; no network.
const fs=require('node:fs'),Module=require('node:module'),assert=require('node:assert/strict'),babel=require('@babel/core');
const React=require('react'),RN=require('react-native-web');
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(mod,file)=>mod._compile(babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:['@babel/preset-typescript',['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code,file);
let index=0,routes=[];
let loading=false,error=false,rows;
const entries=[{id:'canonical',takeId:'t1',roomId:'r1',title:'Canonical proposition',state:'LIVE',status:'open',kind:'CLASH'},{id:'legacy',takeId:'t2',roomId:null,title:'Legacy proposition',state:'LIVE',status:'open',kind:'CLASH'},{id:'pending',takeId:'t3',roomId:null,title:'Pending proposition',state:'PENDING',status:'PENDING',kind:'CHALLENGE'}];
rows=entries;
const original=Module._load;
Module._load=function(request,parent){
 if(request==='react')return {...React,useState(initial){return [[{ownerId:'owner',entries:rows},loading,error][index++]??initial,()=>{}]},useEffect(){},useCallback:fn=>fn};
 if(request==='react-native')return RN;
 if(request==='expo-router')return {useRouter:()=>({push:r=>routes.push(r)}),useFocusEffect(){}};
 if(request==='@react-navigation/native')return {useFocusEffect(){}};
 if(request.endsWith('/theme'))return {...require('../theme/layout.ts'),...require('../theme/typography.ts'),...require('../theme/colors.ts'),useThemeColors:()=>require('../theme/palettes.ts').darkTheme};
 if(request.endsWith('/AuthProvider'))return {useAuth:()=>({user:{id:'owner'}})};
 if(request.endsWith('/LivePulse'))return {LivePulse:RN.View};
 if(request.endsWith('/haptics'))return {press(){}};
 if(request.endsWith('/arenaClashDiscoveryService'))return {fetchClashDiscovery:async()=>entries};
 return original.apply(this,arguments);
};
const {ArenaClashes}=require('../components/arena/ArenaClashes.tsx');
const tree=ArenaClashes({topics:[],onEnter(){},onWatch(){}});
const nodes=v=>v&&typeof v==='object'?[v,...React.Children.toArray(v.props?.children).flatMap(nodes)]:[];
const content=v=>typeof v==='string'?v:v&&typeof v==='object'?React.Children.toArray(v.props?.children).map(content).join(''):'';
for(const [title,label,route] of [['Canonical proposition','LIVE DUEL','/arena/room/r1'],['Legacy proposition','LIVE CLASH','/clash/t2'],['Pending proposition','VIEW TAKE','/take/t3']]){
 const n=nodes(tree).find(n=>n.props?.onPress&&content(n).includes(title));assert.ok(n);assert.ok(content(n).includes(label));n.props.onPress();assert.equal(routes.at(-1),route);
 if(title==='Legacy proposition')assert.ok(!content(n).includes('LIVE DUEL'));
 console.log('PASS '+title+' label and route');
}
for(const [pending,failed,expected] of [[true,false,'Loading live Clashes'],[false,true,'Couldn’t load live Clashes'],[false,false,'No rooms broadcasting right now']]){
 index=0;rows=[];loading=pending;error=failed;
 const text=content(ArenaClashes({topics:[],onEnter(){},onWatch(){}}));
 assert.ok(text.includes(expected));
 if(pending||failed){assert.ok(!text.includes('No rooms broadcasting'));assert.ok(!text.includes('0 live now'));}
 console.log('PASS '+expected);
}
console.log('6/6 controlled Live discovery scenarios passed; not native verification.');
