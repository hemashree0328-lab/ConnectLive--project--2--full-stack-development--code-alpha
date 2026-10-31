let authMode="login", currentUser=null, socket=null, roomId=null, localStream=null, screenStream=null;
const peers=new Map(), remoteNames=new Map();
const $=id=>document.getElementById(id);
function toast(s){const t=$("toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
async function api(url,body){const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||"Request failed");return d}
function show(view){["authView","appView","meetingView"].forEach(id=>$(id).classList.toggle("hidden",id!==view))}
function setUser(u){currentUser=u;$("welcomeName").textContent=u.username;$("userAvatar").textContent=u.username.slice(0,1).toUpperCase();show("appView")}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{authMode=b.dataset.mode;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));$("authSubmit").innerHTML=(authMode==="login"?"Log in":"Create account")+' <span>→</span>';$("authError").textContent=""});
$("authForm").onsubmit=async e=>{e.preventDefault();$("authError").textContent="";try{const d=await api("/api/"+authMode,{username:$("authUsername").value,password:$("authPassword").value});setUser(d.user)}catch(err){$("authError").textContent=err.message}};
$("logoutBtn").onclick=async()=>{await fetch("/api/logout",{method:"POST"});if(socket)socket.disconnect();currentUser=null;show("authView")};
(async()=>{try{const d=await fetch("/api/me").then(r=>r.json());if(d.user)setUser(d.user)}catch{} })();
$("createBtn").onclick=()=>enterRoom(Math.random().toString(36).slice(2,9));
$("joinBtn").onclick=()=>enterRoom($("roomInput").value.trim());
$("roomInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("joinBtn").click()});
async function enterRoom(id){if(!id)return toast("Enter a room ID");roomId=id;try{localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true})}catch(e){toast("Camera/microphone unavailable. Check browser permissions.");return}
$("localVideo").srcObject=localStream;$("roomTitle").textContent="Team meeting";$("roomCode").textContent="Room: "+id;$("messages").innerHTML="";$("fileList").innerHTML="";show("meetingView");$("meetingStatus").textContent="Connecting to room…";
socket=io();socket.on("connect",()=>{socket.emit("join-room",id);$("meetingStatus").textContent="Connected · "+(socket.id.slice(0,5))});
socket.on("connect_error",e=>toast(e.message));socket.on("app-error",toast);
socket.on("room-peers",async list=>{for(const p of list){remoteNames.set(p.id,p.username);await makeOffer(p.id)}});
socket.on("peer-joined",p=>{remoteNames.set(p.id,p.username);toast(p.username+" joined")});
socket.on("signal",async({from,data})=>{let pc=peers.get(from);if(!pc)pc=createPeer(from);if(data.description){await pc.setRemoteDescription(data.description);if(data.description.type==="offer"){const answer=await pc.createAnswer();await pc.setLocalDescription(answer);socket.emit("signal",{to:from,data:{description:pc.localDescription}})}}else if(data.candidate){try{await pc.addIceCandidate(data.candidate)}catch(e){console.warn(e)}}});
socket.on("peer-left",id=>{peers.get(id)?.close();peers.delete(id);$("video-"+id)?.remove();toast("A participant left")});
socket.on("chat-message",m=>addMessage(m.username,m.message));
socket.on("system-message",m=>addSystem(m));
socket.on("whiteboard-draw",drawRemote);
socket.on("whiteboard-clear",clearCanvas);
socket.on("file-shared",addFile);
}
function createPeer(id){const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});peers.set(id,pc);localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));pc.onicecandidate=e=>{if(e.candidate)socket.emit("signal",{to:id,data:{candidate:e.candidate}})};pc.ontrack=e=>{let tile=$("video-"+id);if(!tile){tile=document.createElement("div");tile.className="video-tile";tile.id="video-"+id;const v=document.createElement("video");v.autoplay=true;v.playsInline=true;tile.append(v);const label=document.createElement("span");label.className="video-label";label.textContent=remoteNames.get(id)||"Participant";tile.append(label);$("videos").append(tile)}tile.querySelector("video").srcObject=e.streams[0]};return pc}
async function makeOffer(id){const pc=createPeer(id);const offer=await pc.createOffer();await pc.setLocalDescription(offer);socket.emit("signal",{to:id,data:{description:pc.localDescription}})}
$("micBtn").onclick=()=>{const t=localStream?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;$("micBtn").querySelector("small").textContent=t.enabled?"Mute":"Unmute"}};
$("cameraBtn").onclick=()=>{const t=localStream?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;$("cameraBtn").querySelector("small").textContent=t.enabled?"Camera":"Start camera"}};
$("screenBtn").onclick=async()=>{try{if(screenStream){screenStream.getTracks().forEach(t=>t.stop());return}screenStream=await navigator.mediaDevices.getDisplayMedia({video:true});const track=screenStream.getVideoTracks()[0];for(const pc of peers.values()){const sender=pc.getSenders().find(s=>s.track?.kind==="video");if(sender)await sender.replaceTrack(track)}$("localVideo").srcObject=new MediaStream([track,...localStream.getAudioTracks()]);track.onended=()=>stopScreen()}catch(e){toast("Screen sharing cancelled")}};
async function stopScreen(){if(!screenStream)return;const cam=localStream.getVideoTracks()[0];for(const pc of peers.values()){const sender=pc.getSenders().find(s=>s.track?.kind==="video");if(sender)await sender.replaceTrack(cam)}$("localVideo").srcObject=localStream;screenStream=null}
$("chatForm").onsubmit=e=>{e.preventDefault();const v=$("chatInput").value.trim();if(v&&socket){socket.emit("chat-message",v);$("chatInput").value=""}};
function addMessage(user,msg){const d=document.createElement("div");d.className="message";const b=document.createElement("b");b.textContent=user;const s=document.createElement("span");s.textContent=msg;d.append(b,s);$("messages").append(d);$("messages").scrollTop=$("messages").scrollHeight}
function addSystem(msg){const d=document.createElement("div");d.className="message system";d.textContent=msg;$("messages").append(d)}
document.querySelectorAll(".panel-tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".panel-tab").forEach(x=>x.classList.toggle("active",x===b));["chatPanel","boardPanel","filesPanel"].forEach(id=>$(id).classList.toggle("hidden",id!==b.dataset.panel))});
$("copyRoom").onclick=()=>{navigator.clipboard.writeText(roomId).then(()=>toast("Room ID copied"))};
$("backBtn").onclick=leaveMeeting;$("leaveBtn").onclick=leaveMeeting;
function leaveMeeting(){if(socket){socket.emit("leave-room");socket.disconnect();socket=null}peers.forEach(p=>p.close());peers.clear();localStream?.getTracks().forEach(t=>t.stop());screenStream?.getTracks().forEach(t=>t.stop());localStream=null;screenStream=null;document.querySelectorAll(".remote-tile").forEach(x=>x.remove());[...$("videos").querySelectorAll(".video-tile:not(.local-tile)")].forEach(x=>x.remove());show("appView")}
$("fileInput").onchange=async()=>{const file=$("fileInput").files[0];if(!file)return;if(file.size>10*1024*1024){toast("Maximum file size is 10 MB");return}const fd=new FormData();fd.append("file",file);fd.append("room",roomId);try{const r=await fetch("/api/upload",{method:"POST",body:fd});const d=await r.json();if(!r.ok)throw Error(d.error);addFile(d)}catch(e){toast(e.message)}$("fileInput").value=""};
function addFile(f){if([...$("fileList").children].some(x=>x.dataset.url===f.url))return;const d=document.createElement("div");d.className="file-item";d.dataset.url=f.url;const name=document.createElement("span");name.textContent=f.name+" · "+f.by;const a=document.createElement("a");a.href=f.url;a.textContent="Download";a.download=f.name;a.target="_blank";d.append(name,a);$("fileList").append(d)}
const canvas=$("whiteboard"),ctx=canvas.getContext("2d");let drawing=false,last=null;
function coords(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
canvas.addEventListener("pointerdown",e=>{drawing=true;last=coords(e);canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener("pointermove",e=>{if(!drawing)return;const p=coords(e),color=$("penColor").value;drawLine(last,p,color);socket?.emit("whiteboard-draw",{a:last,b:p,color});last=p});
canvas.addEventListener("pointerup",()=>drawing=false);canvas.addEventListener("pointercancel",()=>drawing=false);
function drawLine(a,b,color){ctx.strokeStyle=color;ctx.lineWidth=3;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
function drawRemote(d){if(d?.a&&d?.b)drawLine(d.a,d.b,d.color||"#25b994")}
function clearCanvas(){ctx.clearRect(0,0,canvas.width,canvas.height)}
$("clearBoard").onclick=()=>{clearCanvas();socket?.emit("whiteboard-clear")};
