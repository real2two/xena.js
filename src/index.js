const SWARM_URL = "wss://swarm.hiven.io/socket?compression=text_json&encoding=json";

class Client {
    constructor(token) {
        if (!token) return console.error(new Error("Missing bot token.").stack);

        this.token = token;
        this.users = {
            get: (async id => {
                if (typeof id !== "string") return console.error(new Error("The user ID must be a string.").stack); 
                if (typeof id.length == 0) return console.error(new Error("The user ID cannot be empty.").stack);
        
                const axios = require("axios");
        
                const res = await axios.get(`https://api.hiven.io/v1/users/${id}`);
                if (!res.data.success) return false;
        
                res.data.data.cached_recieved_timestamp = Date.now();
                this.cache.users[res.data.data] = res.data.data;
        
                return res.data.data;
            })
        }
        this.room = {
            get: (async id => {
                if (typeof id !== "string") return console.error(new Error("The room ID must be a string.").stack); 
                if (typeof id.length == 0) return console.error(new Error("The room ID cannot be empty.").stack);
        
                const room = this.cache.rooms.filter(i => i.id == id);

                return room.length == 1 ? room[0] : undefined;
            }),

            send: (async (room_id, content) => {
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

                if (!res.data.success) return false;

                res.data.data.edit = (async (content) => {
                    const res2 = await axios.patch(`https://api.hiven.io/v1/rooms/${room_id}/messages/${res.data.data.id}`, {
                        content
                    }, {
                        headers: {
                          'Authorization': this.token
                        }
                    });

                    if (!res2.data.success) return false;
                    return res2.data.data;
                });

                res.data.data.delete = (async (content) => {
                    const res2 = await axios.delete(`https://api.hiven.io/v1/rooms/${room_id}/messages/${res.data.data.id}`, {
                        headers: {
                          'Authorization': this.token
                        }
                    });

                    if (!res2.data.success) return false;
                    return res2.data.data;
                });
        
                return res.data.data;
            })
        }
        this.cache = {
            houses: {},
            users: {},
            rooms: []
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
                this.online = false;
            });

            connection.on('message', (message) => {
                if (message.type == 'utf8') {
                    const res = JSON.parse(message.utf8Data);
                    if (res.op == 1) return this.heartbeatInterval = res.d.hbt_int;

                    this.emit(res.e, res);

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

                            for (const room of res.d.rooms) {
                                this.cache.rooms.push(room); //this.cache.rooms.concat(res.d.rooms); doesn't work.
                            }

                            delete res.d.entities; // temp. screw entities.
                            delete res.d.rooms; // Just use <client>.cache.rooms.filter(i => i.house_id == HOUSEID);

                            this.cache.houses[res.d.id] = res.d;

                            this.emit("houseJoin", res.d);
                            break;
                        case "HOUSE_UPDATE":
                            delete res.d.entities; // temp. screw entities.
                            delete res.d.house_id; // same thing as .id, unnecessary.
                            delete res.d.type;

                            this.cache.houses[res.d.id] = res.d;

                            this.emit("houseUpdate", res.d);
                            break;
                        case "ROLE_CREATE":
                        case "ROLE_UPDATE":
                            this.cache.houses[res.d.house_id].roles = this.cache.houses[res.d.house_id].roles.filter(i => i.id !== res.d.id);
                            this.cache.houses[res.d.house_id].roles.push(res.d);

                            this.emit(res.e == "ROLE_CREATE" ? "roleCreate" : "roleUpdate", res.d);
                            break;
                        case "ROLE_DELETE":
                            this.cache.houses[res.d.house_id].roles = this.cache.houses[res.d.house_id].roles.filter(i => i.id !== res.d.id);

                            this.emit("roleDelete", res.d);
                            break;
                        case "MESSAGE_CREATE":
                            const message = res.d;

                            if (!res.d.recipient_ids) {
                                res.d.member.user.cached_recieved_timestamp = Date.now();
                                this.cache.users[res.d.author.id] = res.d.member.user;
                            }

                            const room_id = message.room_id;

                            message.reply = async content => {
                                return await this.room.send(room_id, content);
                            };

                            this.emit("messageCreate", message);
                            break;
                        case "ROOM_CREATE":
                            this.cache.rooms.push(res.d);

                            this.emit("roomCreate", res.d);
                            break;
                        case "ROOM_UPDATE":
                            const testexist = this.cache.rooms.filter(i => i.id == res.d.id);
                            if (testexist.length == 1) {
                                delete testexist[0];
                                this.cache.rooms = testexist;
                            }

                            this.cache.rooms.push(res.d);

                            this.emit("roomUpdate", res.d);
                            break;
                        case "ROOM_DELETE":
                            const testexist2 = this.cache.rooms.filter(i => i.id == res.d.id);
                            if (testexist2.length == 1) {
                                delete testexist2[0];
                                this.cache.rooms = testexist2;
                            }

                            this.emit("roomDelete", res.d);
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