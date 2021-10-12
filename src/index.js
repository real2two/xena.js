const SWARM_URL = "wss://swarm.hiven.io/socket?compression=text_json&encoding=json";

class Client {
    constructor(token) {
        if (!token) return console.error(new Error("Missing bot token.").stack);

        this.token = token;
        this.get = {
            user: this.getUser
        }
        this.cache = {
            houses: {},
            users: {}
        };
        this.online = true;

        const WebSocketClient = require('websocket').client;
        const ws_client = new WebSocketClient();
        ws_client.connect(SWARM_URL);

        this.ws = ws_client;

        ws_client.on("connect", async (connection) => {
            this.ws.connection = connection;

            connection.send(JSON.stringify({
                op: 2,
                d: {
                    token: token
                }
            }));

            connection.on('error', (error) => {
                return console.error(new Error(error.toString()).stack);
            })

            connection.on('close', () => {
                console.log("Bot shutdown.");
                this.online = false;
            });

            connection.on('message', (message) => {
                if (message.type == 'utf8') {
                    const res = JSON.parse(message.utf8Data);
                    if (res.op == 1) return this.heartbeatInterval = res.d.hbt_int;

                    switch (res.e) {
                        case "INIT_STATE":
                            this.emit("ready");
                            this.user = res.d.user;
                            break;
                        case "HOUSE_JOIN":
                            const members = res.d.members;
                            delete res.d.members;
                            for (const { user_id, user } of members) {
                                user.cached_recieved_timestamp = Date.now();
                                this.cache.users[user_id] = user;
                            }
                            this.cache.houses[res.d.id] = res.d;
                            break;
                        case "MESSAGE_CREATE":
                            //console.log(res.d)
                            const message = res.d;

                            res.d.member.user.cached_recieved_timestamp = Date.now();
                            this.cache.users[res.d.author.id] = res.d.member.user;

                            const room_id = message.room_id;

                            message.reply = async content => {
                                return await this.sendinRoom(room_id, content);
                            };

                            this.emit("messageCreate", message);
                            break;
                    }
                }
            });

            const heartbeatInterval = setInterval(() => {
                if (!this.ws) return clearInterval(heartbeatInterval);
                connection.send(JSON.stringify({ op: 3 }));
            }, this.heartbeatInterval || 30000);
        });

        ws_client.on('connectFailed', function(error) {
            return console.error(new Error(error.toString()).stack);
        });
    }
  
    async getUser(id) {
        if (typeof id !== "string") return console.error(new Error("The user ID must be a string.").stack); 
        if (typeof id.length == 0) return console.error(new Error("The user ID cannot be empty.").stack);

        const axios = require("axios");

        const res = await axios.get(`https://api.hiven.io/v1/users/${id}`);
        if (!res.data.success) return false;

        res.data.data.cached_recieved_timestamp = Date.now();
        this.cache.users[res.data.data] = res.data.data;

        return res.data.data;
    }

    async sendinRoom(room_id, content) {
        if (typeof room_id !== "string") return console.error(new Error("The room ID must be a string.").stack); 
        if (typeof room_id.length == 0) return console.error(new Error("The room ID cannot be empty.").stack);
        if (typeof content !== "string") return console.error(new Error("The content must be a string.").stack); 
        if (typeof content.length == 0) return console.error(new Error("The content cannot be empty.").stack);

        const axios = require("axios");

        const res = await axios.post(`https://api.hiven.io/v1/rooms/${room_id}/messages`, {
            content
        }, {
            headers: {
              'Authorization': this.token
            }
        });

        return res.data;
    }

    listeners = {};
  
    on(name, func) {
        this.listeners[name] = this.listeners[name] || [];
        this.listeners[name].push(func);
        return;
    }
  
    emit(eventName, ...args) {
      let fns = this.listeners[eventName];
      if (!fns) return false;
      fns.forEach((f) => {
        f(...args);
      });
      return true;
    }
}
  
module.exports.Client = Client;