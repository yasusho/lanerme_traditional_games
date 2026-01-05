/**
 * AIL LIME - P2P Network Manager
 * PeerJSを使用したP2P通信を管理するモジュール
 */

class NetworkManager {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // peerId -> connection
        this.isHost = false;
        this.hostId = null;
        this.localPlayerId = null;
        this.onMessageCallback = null;
        this.onConnectionCallback = null;
        this.onDisconnectCallback = null;
        this.onErrorCallback = null;
    }

    /**
     * ランダムなルームIDを生成
     */
    generateRoomId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = 'AIL-';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * ホストとして初期化
     * @returns {Promise<string>} 生成されたルームID
     */
    initAsHost() {
        return new Promise((resolve, reject) => {
            const roomId = this.generateRoomId();

            this.peer = new Peer(roomId, {
                debug: 2
            });

            this.peer.on('open', (id) => {
                console.log('[Network] Host initialized with ID:', id);
                this.isHost = true;
                this.hostId = id;
                this.localPlayerId = 0; // ホストはプレイヤー0
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                this.handleConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('[Network] Host error:', err);
                if (this.onErrorCallback) this.onErrorCallback(err);
                reject(err);
            });

            this.peer.on('disconnected', () => {
                console.warn('[Network] Host disconnected from signaling server');
            });
        });
    }

    /**
     * ゲストとして接続
     * @param {string} hostId ホストのルームID
     * @returns {Promise<void>}
     */
    initAsGuest(hostId) {
        return new Promise((resolve, reject) => {
            // ゲストには独自のIDを生成
            const guestId = 'GUEST-' + Math.random().toString(36).substr(2, 8);

            this.peer = new Peer(guestId, {
                debug: 2
            });

            this.peer.on('open', (id) => {
                console.log('[Network] Guest initialized with ID:', id);
                this.isHost = false;
                this.hostId = hostId;

                // ホストに接続
                const conn = this.peer.connect(hostId, {
                    reliable: true
                });

                conn.on('open', () => {
                    console.log('[Network] Connected to host:', hostId);
                    this.connections.set(hostId, conn);
                    this.setupConnectionHandlers(conn);
                    resolve();
                });

                conn.on('error', (err) => {
                    console.error('[Network] Connection error:', err);
                    reject(err);
                });
            });

            this.peer.on('error', (err) => {
                console.error('[Network] Guest error:', err);
                if (this.onErrorCallback) this.onErrorCallback(err);
                reject(err);
            });
        });
    }

    /**
     * 新しい接続を処理
     */
    handleConnection(conn) {
        console.log('[Network] New connection from:', conn.peer);

        conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            this.setupConnectionHandlers(conn);

            if (this.onConnectionCallback) {
                // 接続順でプレイヤーIDを割り当て
                const playerId = this.connections.size;
                this.onConnectionCallback(conn.peer, playerId);
            }
        });
    }

    /**
     * 接続のイベントハンドラを設定
     */
    setupConnectionHandlers(conn) {
        conn.on('data', (data) => {
            console.log('[Network] Received:', data);
            if (this.onMessageCallback) {
                this.onMessageCallback(data, conn.peer);
            }
        });

        conn.on('close', () => {
            console.log('[Network] Connection closed:', conn.peer);
            this.connections.delete(conn.peer);
            if (this.onDisconnectCallback) {
                this.onDisconnectCallback(conn.peer);
            }
        });

        conn.on('error', (err) => {
            console.error('[Network] Connection error:', err);
        });
    }

    /**
     * 全ての接続先にメッセージを送信
     */
    broadcast(message) {
        console.log('[Network] Broadcasting:', message);
        this.connections.forEach((conn) => {
            if (conn.open) {
                conn.send(message);
            }
        });
    }

    /**
     * 特定のピアにメッセージを送信
     */
    send(peerId, message) {
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
            conn.send(message);
        } else {
            console.warn('[Network] Cannot send to', peerId, '- connection not open');
        }
    }

    /**
     * ホストにメッセージを送信（ゲスト用）
     */
    sendToHost(message) {
        if (this.isHost) {
            console.warn('[Network] Cannot send to host: I am the host');
            return;
        }
        if (this.hostId) {
            this.send(this.hostId, message);
        } else {
            console.error('[Network] Host ID not set');
        }
    }

    /**
     * メッセージ受信時のコールバックを設定
     */
    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    /**
     * 新しい接続時のコールバックを設定
     */
    onConnection(callback) {
        this.onConnectionCallback = callback;
    }

    /**
     * 切断時のコールバックを設定
     */
    onDisconnect(callback) {
        this.onDisconnectCallback = callback;
    }

    /**
     * エラー時のコールバックを設定
     */
    onError(callback) {
        this.onErrorCallback = callback;
    }

    /**
     * 接続されているピアの数を取得
     */
    getConnectionCount() {
        return this.connections.size;
    }

    /**
     * 接続を閉じる
     */
    disconnect() {
        this.connections.forEach((conn) => {
            conn.close();
        });
        this.connections.clear();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }

    /**
     * ホストかどうかを返す
     */
    isHostPeer() {
        return this.isHost;
    }

    /**
     * ローカルのプレイヤーIDを取得
     */
    getLocalPlayerId() {
        return this.localPlayerId;
    }

    /**
     * ローカルのプレイヤーIDを設定
     */
    setLocalPlayerId(id) {
        this.localPlayerId = id;
    }
}

// グローバルインスタンス
const networkManager = new NetworkManager();
