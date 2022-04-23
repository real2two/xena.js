# Note: This is most likely discontinued since I don't have access to Hiven anymore. 


## xena.js

A work in progress Hiven Javascript library. (ik code is bad rn, I'll organize it if I decide to continue this.)

This was created due to hiven.js problems.

NPM: https://www.npmjs.com/package/xena.js

Hiven house: https://hiven.house/yxt040

### Example usage.

```js
const xena = require("xena.js");
const client = new xena.Client("user or bot token here");

client.on("ready", () => {
    console.log("[BOT] Bot is ready!")
});

client.on("messageCreate", async msg => {
    if (msg.content == "!hello") {
        msg.reply("Hello world!")
    }
});
```
