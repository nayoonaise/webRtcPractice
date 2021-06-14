let localVideo = document.getElementById('localVideo');
let remoteVideo = document.getElementById('remoteVideo');

let localStream;
let remoteStream;

let peerConnection;

/* 
    navigator.mediaDevices.getUserMedia()에서 데이터스트림 받아옴.
    gotStream() 으로 본인
*/
navigator.mediaDevices
    .getUserMedia({
        video: true,
        audio:false,
    })
    .then(stream => gotStream(stream))
    .catch((error) => console.error(':: getUserMedia - error!'));

function gotStream(stream){
    console.log(":: gotStream() ");
    localStream = stream;

    // 내 <Video>에 내 영상을 박고
    localVideo.srcObject = stream;

    // 시그널링 서버에 메시징
    sendMessage("got user media");

    if(isInitiator) { 
        maybeStart();
    }
}

let isStarted = false;
let isChannelReady = false;

function maybeStart() {
    console.log(":: maybeStart() ");
    
    if(!isStarted && isChannelReady && typeof localStream !== 'undefined' ) {
        
        // connection 생성. 내 stream 연결.
        createPeerConnection();
        peerConnection.addStream(localStream); 
        isStarted = true;
        console.log(":: maybeStart() - ready! ");
        if(isInitiator) { // 실제 연결이 되었다면, sessionDescription 데이터를 주고받음.
            doCall();
        }

    } else {
        console.error(" maybeStart() - not started!");
    }
}


 
/* connection 생성 */
// 시그널링 - sessionDescription교환, connection 생성, 상대stream 획득 */
function createPeerConnection() {
    try {
        console.log(":: createPeerConnection");
        peerConnection = new RTCPeerConnection(null);
        
        // iceCandidate할 대상이 생김.
        // connection 정보를 받고, 시그널링서버를 통해 상대가 내 스트림에 연결하도록 SDP를 줌. 
        peerConnection.onicecandidate = handleIceCandidate;

        // connection 상대가 remote stream을 비디오에 띄우도록 함.
        peerConnection.onaddstream = handleRemoteStreamAdded;

        console.log(":: createPeerConnection - connection created");
    } catch(e) {
        alert(':: Cannot create RTCPeerConnection Obj');
        return;
    }

    let handleIceCandidate = (e) => {
        console.log(":: iceCandidateEvent", e);
        if(e.candidate) {
            console.log(":: iceCandidateEvent - sent a Message");
            sendMessage({
                type: "candidate",
                label: e.candidate.sdpMLineIndex,
                id: e.candidate.sdpMid,
                candidate: e.candidate.candidate
            })
        } else {
            console.log(":: iceCandidateEvent - end of candidates")
        }
    }

    let  handleRemoteStreamAdded = (e) => {
        console.log(":: handleRemoteStreamAdded", e);
        remoteStream = e.stream;
        remoteVideo.srcObject = remoteStream;
    }

}


/* connection 통해  */


function doCall() { // sessionDescription데이터 받고.
    console.log(":: doCall()")
    peerConnection.createOffer(setLocalAndSendMessage, onError);
}
function doAnswer() { //sessionDescription데이터 받고
    console.log(":: doAnswer()");
    peerConnection.createAnswer().then(setLocalAndSendMessage,onError);
}

function setLocalAndSendMessage(sessionDescription) {
    peerConnection.setLocalDescription(sessionDescription);
    sendMessage(sessionDescription);
}
function onError() {
    console.log(":: error");
}



/////////////////////////


function sendMessage(message) {
    console.log(":: sendMessage() ");
    socket.emit('message', message);
}


/* 소켓통신부분 */

let pcConfig = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
};

socket.on('message', (message) => {
    console.log(":: Client received a message : ",message);

    if(message === 'got user media') {
        maybeStart();
        return;
    }
    
    if (message.type === 'offer') {
        if(!isInitiator && !isStarted) {
            maybeStart();
        }
        peerConnection.setRemoteDescription(
            new RTCSessionDescription(message));
            doAnswer();
    } else if (message.type === 'answer' && isStarted) {
        peerConnection.setRemoteDescription(
            new RTCSessionDescription(message)
        );
    } else if (message.type === 'candidate' && isStarted) {
        const candidate = new RTCIceCandidate({
            sdpMLineIndex : message.label,
            candidate: message.candidate,
        });
        peerConnection.addIceCandidate(candidate);
    }
});



/* signaling server */

const http = require('http');
const os = require('os');
const socketIO = require('socket.io');
const nodeStatic = require('node-static');

let fileServer = new(nodeStatic.Server)();
let app = http.createServer((req,res) => {
    fileServer.serve(req,res);
}).listen(8080);

let io = socketIO.listen(app);
io.socket.on('connection').on('connection', socket => {
    function log() {
        let array = ['Message from Server'];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }

    socket.on('message', message => {
        log('Client said: ', message);
        socket.broadcast.emit('message', message);
    });

    socket.on('create or join', room => {
        let clientsInRoom = io.sockets.adapter.rooms[room];
        let numClients = clientsInRoom ? 
         Object.keys(clientsInRoom.socket).length: 0;
        log('Room ' + room + ' now has ' + numClients + ' client(s)');

        if(numClients === 0) {
            console.log('create room! ');
            socket.join(room);
            log("Client ID " + socket.id + ' created room '+ room);
            socket.emit('created', room,socket.id);
        
        } else if (numClients === 1) {
            console.log('join room! ');
            log("Client ID " + socket.id + ' joined room '+ room);
            io.sockets.in(room).emit('join', room);
            socket.join(room);
            socket.emit('joined', room,socket.id);
            io.sockets.in(roomt).emit('ready');

        } else {
            socket.emit('full',room);
        }
    })





})


