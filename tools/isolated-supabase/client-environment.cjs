const path=require('node:path');
const policy=require('./client-environment.json');
function clientEnvironment(inherited=process.env,platform=process.platform) {
 const env={};
 for(const [key,value] of Object.entries(inherited)) if(policy.allowed.includes(key.toUpperCase())) env[key.toUpperCase()]=value;
 if(platform==='win32') for(const key of policy.windows_required) {
  const value=env[key];
  if(typeof value!=='string'||!value.trim()||/[\r\n\0]/.test(value)||(key!=='PATH'&&!path.win32.isAbsolute(value)))
   throw new Error('Missing or invalid Windows client prerequisite: '+key);
 }
 return env;
}
module.exports={clientEnvironment};
