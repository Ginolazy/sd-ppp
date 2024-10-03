import { app } from "photoshop";
import { storage } from "uxp";
import { getAllSubLayer } from "./util";
import socketio from './library/socket.io.js'
import sendImages from "./events/send_images";
import getImage from "./events/get_image";
import getActiveHistoryStateId from "./events/get_active_history_state_id";

class ComfyConnection {
    static instance = null;

    static _connectStateCallbacks = [];
    static onConnectStateChange(callback) {
        ComfyConnection._connectStateCallbacks.push(callback);
    }
    static _callConnectStateChange() {
        ComfyConnection._connectStateCallbacks.forEach(cb => {
            try {
                cb(ComfyConnection.instance?.isConnected)
            } catch (e) { console.error(e) }
        });
    }

    static createInstance(comfyURL, userId) {
        if (ComfyConnection.instance && ComfyConnection.instance.isConnected) {
            ComfyConnection.instance.disconnect();
        }
        ComfyConnection.instance = new ComfyConnection(comfyURL, userId);
    }

    get isConnected() {
        return this.socket != null && this.socket.connected === true;
    }

    comfyURL = '';
    interval = null;
    constructor(comfyURL, userId) {
        ComfyConnection.instance = this;
        if (!comfyURL) {
            comfyURL = 'http://127.0.0.1:8188';
        }
        this.comfyURL = comfyURL.replace(/\/*$/, '');
        if (!userId) {
            userId = '';
        }
        this.userId = userId;
        this.connect();
    }
    connect() {
        console.log('connect')
        if (!this.socket) {
            this._createSocket();
        }
        this.socket.connect();
    }
 
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    _createSocket() {
        console.log('create socket')
        const socket = this.socket = socketio(this.comfyURL, {
            autoConnect: false,
            transports: ["websocket"],
            path: '/sd-ppp/',
            query: {
                version: 1,
                type: 'photoshop',
                user_id: this.userId,
            }
        });
        this.interval = setInterval(() => {
            if (!this.isConnected) return;
            const allLayers = getAllSubLayer(app.activeDocument); 
            this.socket.emit('sync_layers',
                { layers: allLayers }
            )
        }, 3000)

        socket.on('connect_error', (error) => {
            if (socket.active) {
                console.error('connect_error reconnecting...')
            } else {
                console.error('connect_error disconnected')
            }
            ComfyConnection._callConnectStateChange();
        });
        socket.on('connect', () => {
            console.log('connect')
            storage.secureStorage.setItem('comfyURL', this.comfyURL);
            ComfyConnection._callConnectStateChange();
        });
        socket.on('disconnect', () => {
            console.log('disconnect')
            ComfyConnection._callConnectStateChange();
        });

        socket.on('get_image', async (data, callback) => {
            try {
                const startTime = Date.now();
                const result = await getImage(this.comfyURL, data)
                console.log('get_image cost', Date.now() - startTime, 'ms');
                callback(result)
            } catch (e) { console.error(e); callback({ error: e.message }) }
        })
        socket.on('send_images', async (data, callback) => {
            try {
                const result = await sendImages(this.comfyURL, data)
                callback(result)
            } catch (e) { console.error(e); callback({ error: e.message }) }
        })
        socket.on('get_active_history_state_id', async (data, callback) => {
            try {
                const result = await getActiveHistoryStateId(data)
                callback(result)
            } catch (e) { console.error(e); callback({ error: e.message }) }
        })
    }
}

export default ComfyConnection;