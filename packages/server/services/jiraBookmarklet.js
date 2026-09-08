// jiraBookmarklet.js — The twenty lines that remove the token from setup.
//
// Dragged to a bookmarks bar once, clicked on a Jira tab, this runs inside that
// tab and becomes Jira+'s hands. Every request it executes carries the browser's
// own session cookie, so Jira answers exactly as it does when you click a link.
// Jira+ never sees a credential because there is no credential to see.
//
// Three details are load-bearing and none is obvious:
//
//   * It proves the page by ASKING Jira who you are, not by matching a hostname.
//     This instance lives at jira.healthspring-jira-prod.aws.zilverton.com and
//     the next one will be somewhere else; a hostname test is a guess that fails
//     silently. /rest/api/2/myself proves the page and the session at once, and
//     the name it returns is what somebody actually wants to see.
//
//   * Every write carries `X-Atlassian-Token: no-check`. Jira Data Center rejects
//     a cookie-authenticated POST without it as cross-site forgery, and the
//     message it returns does not say so. Without this header every write fails
//     and nothing explains why.
//
//   * It keeps polling after Jira+ restarts. The tab never unloaded, so no
//     deregister was ever sent; the loop simply reconnects. Requiring a human to
//     re-click after every restart was the single most annoying thing about the
//     tool this pattern came from.
//
// It is built here rather than in the client so the port is always this server's
// port. A bookmarklet with the wrong port in it sits in a bookmarks bar looking
// correct for months.

/** The path that proves both "this is Jira" and "you are signed in". */
const IDENTITY_PATH = '/rest/api/2/myself';

/** Where the badge sits, and what each state looks like. */
const BADGE_STYLE =
  'position:fixed;bottom:16px;right:16px;padding:10px 16px;border-radius:8px;' +
  'font:600 13px system-ui,sans-serif;color:#fff;z-index:2147483647;' +
  'box-shadow:0 8px 24px rgba(0,0,0,.4);cursor:pointer;max-width:420px';

/**
 * Builds the complete `javascript:` bookmarklet.
 *
 * @param {number} port The port this Jira+ is serving on.
 */
function buildJiraBookmarklet(port) {
  const relayServer = `http://127.0.0.1:${port}`;

  const body = [
    `var relay=${JSON.stringify(relayServer)};`,
    'var isRunning=true;',
    'var badge=null;',

    // One badge, reused. Clicking it dismisses it.
    'function say(message,colour){' +
      'if(!badge||!badge.isConnected){badge=document.createElement("div");' +
      'badge.onclick=function(){badge.remove();};document.body.appendChild(badge);}' +
      `badge.style=${JSON.stringify(BADGE_STYLE)}+";background:"+colour;` +
      'badge.textContent=message;}',

    // Ask Jira who we are. This is the page test and the sign-in proof together.
    'async function whoAmI(){' +
      `var reply=await fetch(location.origin+${JSON.stringify(IDENTITY_PATH)},` +
      '{credentials:"include",headers:{Accept:"application/json"}});' +
      'if(!reply.ok)throw new Error("HTTP "+reply.status);' +
      'var account=await reply.json();' +
      'return account.displayName||account.name||"an unnamed account";}',

    'async function report(payload){' +
      'await fetch(relay+"/api/relay/result",{method:"POST",mode:"cors",' +
      'headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});}',

    // The whole point. credentials:"include" is what makes the cookie travel.
    // X-Atlassian-Token is what makes Jira Data Center accept a write.
    'async function run(job){' +
      'try{' +
      'var headers={"Accept":"application/json","Content-Type":"application/json",' +
      '"X-Atlassian-Token":"no-check","X-Requested-With":"XMLHttpRequest"};' +
      'var stop=new AbortController();' +
      'var timer=setTimeout(function(){stop.abort();},job.timeoutMs||30000);' +
      'var options={method:job.method||"GET",credentials:"include",headers:headers,signal:stop.signal};' +
      'if(job.body!=null)options.body=JSON.stringify(job.body);' +
      'var reply=await fetch(location.origin+job.path,options);' +
      'clearTimeout(timer);' +
      'var text=await reply.text();' +
      'await report({id:job.id,ok:reply.ok,status:reply.status,data:text,error:null});' +
      '}catch(failure){' +
      'await report({id:job.id,ok:false,status:0,data:null,error:failure.message});}}',

    // Reconnects on its own after Jira+ restarts: the tab never unloaded, so
    // nothing told the bridge we left, and the loop just carries on.
    'async function loop(){' +
      'while(isRunning){' +
      'try{' +
      'var reply=await fetch(relay+"/api/relay/poll",{mode:"cors",cache:"no-store"});' +
      'var payload=await reply.json();' +
      'if(payload&&payload.request)await run(payload.request);' +
      '}catch(pollFailure){' +
      'say("Jira+ relay lost the connection - "+pollFailure.message,"#b3261e");' +
      'await new Promise(function(done){setTimeout(done,2000);});}}}',

    // Renamed so it is findable among twenty tabs, and it asks before closing.
    'try{if(document.title.indexOf("RELAY -")!==0)document.title="RELAY - "+document.title;}catch(renameFailure){}',
    'window.addEventListener("beforeunload",function(closing){' +
      'if(!isRunning)return;closing.preventDefault();closing.returnValue="";});',
    'window.addEventListener("pagehide",function(){isRunning=false;' +
      'try{navigator.sendBeacon(relay+"/api/relay/deregister");}catch(beaconFailure){}});',

    '(async function(){' +
      'var displayName;' +
      'try{displayName=await whoAmI();}catch(identityFailure){' +
      'say("Not a Jira page, or not signed in. Open Jira and click this again.","#b3261e");' +
      'return;}' +
      'try{' +
      'await fetch(relay+"/api/relay/register",{method:"POST",mode:"cors",' +
      'headers:{"Content-Type":"application/json"},' +
      'body:JSON.stringify({origin:location.origin,displayName:displayName})});' +
      'say("Jira+ relay active - signed in as "+displayName,"#2e7d4f");' +
      'loop();' +
      '}catch(bridgeFailure){' +
      'say("Jira+ is not running at "+relay+". Start it and click this again.","#b3261e");}})();',
  ].join('');

  return `javascript:(function(){${body}})()`;
}

export { IDENTITY_PATH, buildJiraBookmarklet };
