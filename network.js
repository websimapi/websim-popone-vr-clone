export class NetworkManager {
    constructor() {
        this.socket = new WebsimSocket();
        this.peers = {};
        this.myId = null;
        this.state = {
            phase: 'lobby', // lobby, flight, game
            podPosition: { x: 0, y: 300, z: 0 },
            gameStartTime: 0
        };
    }

    async init(onStateChange, onPeerUpdate) {
        await this.socket.initialize();
        this.myId = this.socket.clientId;

        // Subscribe to game state (Phases, Pod position)
        this.socket.subscribeRoomState((state) => {
            if (state.phase) this.state.phase = state.phase;
            if (state.podPosition) this.state.podPosition = state.podPosition;
            if (state.gameStartTime) this.state.gameStartTime = state.gameStartTime;
            if (onStateChange) onStateChange(this.state);
        });

        // Subscribe to players
        this.socket.subscribePresence((presence) => {
            this.peers = presence;
            if (onPeerUpdate) onPeerUpdate(presence);
        }); 
        
        // Initial setup if empty
        if (!this.socket.roomState.phase) {
            this.socket.updateRoomState({
                phase: 'lobby',
                podPosition: { x: 0, y: 300, z: 0 }
            });
        }
    }

    updatePlayer(data) {
        this.socket.updatePresence(data);
    }

    startGame() {
        this.socket.updateRoomState({
            phase: 'flight',
            gameStartTime: Date.now(),
            podPosition: { x: 0, y: 400, z: -500 } // Start far away
        });
    }

    updatePod(pos) {
        this.socket.updateRoomState({ podPosition: pos });
    }
    
    setPhase(phase) {
        this.socket.updateRoomState({ phase });
    }
}