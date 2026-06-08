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
            // ホストIDの永続化（タブ/リロード対策）
            // sessionStorageを使用してブラウザ閉じたらリセット
            let roomId = sessionStorage.getItem('ail_lime_host_id');
            if (!roomId) {
                roomId = this.generateRoomId();
                sessionStorage.setItem('ail_lime_host_id', roomId);
            }

            console.log('[Network] Initializing as host with ID:', roomId);

            this.peer = new Peer(roomId, {
                debug: 2
            });

            this.peer.on('open', (id) => {
                console.log('[Network] Host initialized with ID:', id);
                this.isHost = true;
                this.hostId = id;
                this.localPlayerId = 0; // ホストはプレイヤー0

                // IDが異なる場合（重複などで割り当てられた場合）は保存更新
                if (id !== roomId) {
                    console.warn('[Network] ID mismatch, updating saved ID:', id);
                    sessionStorage.setItem('ail_lime_host_id', id);
                }

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
            // ゲストIDの永続化
            let guestId = localStorage.getItem('ail_lime_guest_id');
            if (!guestId) {
                guestId = 'GUEST-' + Math.random().toString(36).substr(2, 8);
                localStorage.setItem('ail_lime_guest_id', guestId);
            }

            console.log('[Network] Initializing as guest with ID:', guestId);

            const tryConnect = (retryCount = 0) => {
                const peer = new Peer(guestId, {
                    debug: 2
                });

                peer.on('open', (id) => {
                    console.log('[Network] Guest initialized with ID:', id);
                    this.isHost = false;
                    this.hostId = hostId;
                    this.peer = peer;

                    // ホストに接続
                    const conn = peer.connect(hostId, {
                        reliable: true
                    });

                    conn.on('open', () => {
                        console.log('[Network] Connected to host:', hostId);
                        this.connections.set(hostId, conn);
                        this.setupConnectionHandlers(conn);
                        resolve();
                    });

                    conn.on('error', (err) => {
                        console.error('[Network] Connection to host failed:', err);
                        reject(err);
                    });
                });

                peer.on('error', (err) => {
                    console.error('[Network] Peer error:', err);
                    if (err.type === 'unavailable-id') {
                        if (retryCount < 5) {
                            console.warn(`[Network] ID unavailable, retrying (${retryCount + 1}/5)...`);
                            peer.destroy();
                            setTimeout(() => {
                                tryConnect(retryCount + 1);
                            }, 1000 + (retryCount * 500));
                            return;
                        }

                        console.warn('[Network] ID permanently unavailable, generating new one...');
                        localStorage.removeItem('ail_lime_guest_id');
                        guestId = 'GUEST-' + Math.random().toString(36).substr(2, 8);
                        localStorage.setItem('ail_lime_guest_id', guestId);
                        tryConnect(0);
                    } else {
                        reject(err);
                    }
                });
            };

            tryConnect();
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
