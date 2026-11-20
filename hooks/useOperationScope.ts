import React from 'react';

/** Reject late work after scope changes, including A → B → A and unmount. */
export function useOperationScope(key:string):()=>boolean {
 const current=React.useRef({key,active:true});
 if(current.current.key!==key)current.current={key,active:true};
 const ticket=current.current;
 React.useEffect(()=>{ticket.active=true;return()=>{ticket.active=false;};},[ticket]);
 return React.useCallback(()=>current.current===ticket&&ticket.active,[ticket]);
}
